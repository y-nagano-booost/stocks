#!/usr/bin/env python3
import sys
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text

# ----- テクニカル指標計算用関数 -----
def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def compute_bollinger_bands(series: pd.Series, window: int = 25):
    ma = series.rolling(window=window, min_periods=window).mean()
    std = series.rolling(window=window, min_periods=window).std()
    return ma + 2*std, ma - 2*std

# ----- NaN を None に変換 -----
def safe_val(val):
    return None if pd.isna(val) else val

# ----- int変換の安全装置 -----
def safe_int(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    return int(val)

# ----- メイン処理 -----
if len(sys.argv) < 2:
    print("使用法: python analyze.py [銘柄コード]")
    sys.exit(1)

ticker_code = sys.argv[1]
engine = create_engine("mysql+pymysql://app_user:your_password@localhost/mydb")

# 1) 最新OHLC日取得
with engine.connect() as conn:
    latest_date = conn.execute(
        text("SELECT MAX(date) FROM ohlc_data WHERE stock_code = :code"),
        {"code": ticker_code}
    ).scalar()

today = datetime.today().date()
if latest_date:
    start_date = latest_date - timedelta(days=93)
else:
    start_date = today - timedelta(days=365*3)

# 2) yfinance で価格データ取得
df = yf.download(ticker_code,
                 start=start_date.strftime('%Y-%m-%d'),
                 end=today.strftime('%Y-%m-%d'))
if df.empty:
    print("FAIL yf.download")
    sys.exit(0)

df.reset_index(inplace=True)
df['date'] = pd.to_datetime(df['Date']).dt.date

# 3) テクニカル指標算出
df['rsi'] = compute_rsi(df['Close'])
df['ma5'] = df['Close'].rolling(5, min_periods=5).mean()
df['ma25'] = df['Close'].rolling(25, min_periods=25).mean()
df['bb_upper'], df['bb_lower'] = compute_bollinger_bands(df['Close'])

df['stock_code'] = ticker_code
df = df[['date','stock_code','Open','High','Low','Close','Volume','rsi','ma5','ma25','bb_upper','bb_lower']]
df.columns = ['date','stock_code','open','high','low','close','volume','rsi','ma5','ma25','bb_upper','bb_lower']
for c in ['open','high','low','close','volume','rsi','ma5','ma25','bb_upper','bb_lower']:
    df[c] = pd.to_numeric(df[c], errors='coerce')

# 4) FB: 既存日以降のみ upsert
if latest_date:
    df = df[df['date'] > start_date]

with engine.begin() as conn:
    for _, r in df.iterrows():
        conn.execute(text("""
            INSERT INTO ohlc_data
              (date, stock_code, open, high, low, close,
               volume, rsi, ma5, ma25, bb_upper, bb_lower)
            VALUES
              (:date,:code,:open,:high,:low,:close,
               :volume,:rsi,:ma5,:ma25,:bb_upper,:bb_lower)
            ON DUPLICATE KEY UPDATE
              open=VALUES(open), high=VALUES(high),
              low=VALUES(low), close=VALUES(close),
              volume=VALUES(volume), rsi=VALUES(rsi),
              ma5=VALUES(ma5), ma25=VALUES(ma25),
              bb_upper=VALUES(bb_upper), bb_lower=VALUES(bb_lower)
        """), {
            "date":   r['date'],
            "code":   r['stock_code'],
            "open":   safe_val(r['open']),
            "high":   safe_val(r['high']),
            "low":    safe_val(r['low']),
            "close":  safe_val(r['close']),
            "volume": safe_val(r['volume']),
            "rsi":    safe_val(r['rsi']),
            "ma5":    safe_val(r['ma5']),
            "ma25":   safe_val(r['ma25']),
            "bb_upper": safe_val(r['bb_upper']),
            "bb_lower": safe_val(r['bb_lower'])
        })

# 5) stocks テーブル: RSI と Price 更新
if not df.empty:
    last = df.iloc[-1]
    price = last['close'] if last['close'] is not None else last['open']
    rsi   = safe_val(last['rsi'])
    price_date = last['date'].strftime("%Y-%m-%d")
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE stocks
            SET rsi=:rsi, price=:price, price_date=:price_date,updatedAt=NOW()
            WHERE code=:code
        """), {"rsi":rsi,"price":price,"price_date":price_date,"code":ticker_code})

# 6) 配当 & 決算 & 株価指標
tk = yf.Ticker(ticker_code)
# 過去配当
divs = tk.dividends
if not divs.empty:
    div_date = divs.index[-1].date()
    div_amt  = float(divs.iloc[-1])
else:
    div_date = None; div_amt = None
# 決算情報
fin = tk.financials
if fin is not None and not fin.empty:
    col0 = fin.columns[0]
    rev  = safe_int(fin.loc['Total Revenue', col0]) if 'Total Revenue' in fin.index else None
    eps  = safe_val(tk.info.get('trailingEps'))
else:
    rev = None; eps = None
info = tk.info or {}
dy  = info.get('dividendYield'); pe = info.get('forwardPE')

with engine.begin() as conn:
    conn.execute(text("""
        UPDATE stocks
        SET last_div_date=:dd, last_div_amount=:da,
            latest_rev=:rev, latest_eps=:eps,
            dividend_yield=:dy, forward_pe=:pe,
            updatedAt=NOW()
        WHERE code=:code
    """), {
        "dd":div_date, "da":div_amt,
        "rev":rev, "eps":eps,
        "dy":dy, "pe":pe, "code":ticker_code
    })

# 7) 直近４四半期 業績取得＆格納
qf = tk.quarterly_financials
if qf is None or qf.empty:
    revs = [None]*4; nis = [None]*4
else:
    q4 = qf.iloc[:,:4]
    revs = [safe_int(q4.loc['Total Revenue',c]) if 'Total Revenue' in q4.index else None
            for c in q4.columns]
    nis  = [safe_int(q4.loc['Net Income', c]) if 'Net Income'    in q4.index else None
            for c in q4.columns]
    revs += [None]*(4-len(revs)); nis += [None]*(4-len(nis))

with engine.begin() as conn:
    conn.execute(text("""
        UPDATE stocks
        SET rev_q1=:r1,rev_q2=:r2,rev_q3=:r3,rev_q4=:r4,
            ni_q1=:n1, ni_q2=:n2, ni_q3=:n3, ni_q4=:n4,
            updatedAt=NOW()
        WHERE code=:code
    """), {
        "r1":revs[0], "r2":revs[1], "r3":revs[2], "r4":revs[3],
        "n1":nis[0],  "n2":nis[1],  "n3":nis[2],  "n4":nis[3],
        "code":ticker_code
    })

# 8) 前年の四半期業績取得と格納（前年の売上・純資産）
prev_qf = tk.quarterly_balance_sheet
if prev_qf is None or prev_qf.empty:
    assets = [None]*4
else:
    q4_prev = prev_qf.iloc[:, :4]
    assets = [safe_int(q4_prev.loc['Total Assets', c]) if 'Total Assets' in q4_prev.index else None
              for c in q4_prev.columns]
    assets += [None] * (4 - len(assets))

# yfinance では過去の四半期売上データは古い順にさかのぼって取得されないため、
# 年度ベースの financials から前年の数値を抽出（近似的に）
ann_fin = tk.financials
if ann_fin is None or ann_fin.empty:
    prev_revs = [None]*4
else:
    prev_col = ann_fin.columns[1] if len(ann_fin.columns) > 1 else ann_fin.columns[0]
    est_prev_rev = safe_int(ann_fin.loc['Total Revenue', prev_col]) if 'Total Revenue' in ann_fin.index else None
    prev_revs = [round(est_prev_rev / 4)] * 4 if est_prev_rev else [None] * 4

# stocks テーブルに保存
with engine.begin() as conn:
    conn.execute(text("""
        UPDATE stocks
        SET prev_rev_q1=:pr1, prev_rev_q2=:pr2, prev_rev_q3=:pr3, prev_rev_q4=:pr4,
            prev_ni_q1=:pa1, prev_ni_q2=:pa2, 
            prev_ni_q3=:pa3, prev_ni_q4=:pa4,
            updatedAt=NOW()
        WHERE code=:code
    """), {
        "pr1": prev_revs[0], "pr2": prev_revs[1], "pr3": prev_revs[2], "pr4": prev_revs[3],
        "pa1": assets[0],     "pa2": assets[1],    "pa3": assets[2],    "pa4": assets[3],
        "code": ticker_code
    })
print("Completed")