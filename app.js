// app.js（Express の設定ファイルなど）
const express = require('express');
const moment = require('moment');
const app = express();

// ビュー全体で moment() が使えるように
app.locals.moment = moment;

// 他のルート設定、ミドルウェア等…
const { sequelize, Stock } = require('./models/stock');  // 先ほど作成したファイルからインポート

const port = 3000;

app.use(express.static('public'));

// MySQL接続確認とテーブルの同期
sequelize.authenticate()
  .then(() => {
    console.log('Connected to the database.');
    // Sequelize.sync()は既にmodels/stock.jsで呼び出しているので、改めて不要な場合もあります。
  })
  .catch(err => console.error('Unable to connect to the database:', err));

// ルートエンドポイント（例：本番では更にルーティングを分離するなど推奨）
app.get('/', (req, res) => {
  res.redirect('/stocks');
});

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('layout', 'layout'); // views/layout.ejs が使われます
app.get('/stocks', async (req, res) => {
  try {
    const stocks = await Stock.findAll();
    res.render('stocks', { layout: 'layout', stocks, title: `銘柄一覧` }); // ← ここでテンプレートにデータを渡す
  } catch (err) {
    console.error(err);
    res.status(500).send('データ取得エラー');
  }
});
app.get('/stocks/:id', async (req, res) => {
  try {
    const stock = await Stock.findByPk(req.params.id);
    if (!stock) return res.status(404).send('銘柄が見つかりません');

    const [ohlcRows] = await sequelize.query(`
      SELECT date, open, high, low, close, rsi, ma5, ma25, bb_upper, bb_lower
      FROM ohlc_data
      WHERE stock_code = '${stock.code}'
      ORDER BY date ASC
    `);

    res.render('stock-detail', {
      layout: 'layout',
      stock,
      title: `${stock.name}のチャート`,
      ohlcData: ohlcRows // ← これが必要！
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('エラーが発生しました');
  }
});


const { exec } = require("child_process");

app.post("/analyze-all", async (req, res) => {
  const stocks = await Stock.findAll({ attributes: ['code'] });

  for (const stock of stocks) {
    const command = `python3 scripts/analyze.py ${stock.code}`;
    exec(command, (error, stdout, stderr) => {
      if (error) console.error(`分析エラー (${stock.code}):`, stderr);
      else console.log(`分析完了 (${stock.code}):`, stdout);
    });
  }

  res.redirect("/stocks"); // 分析完了後に一覧に戻る
});
const { Op } = require("sequelize");

app.post("/analyze-stale", async (req, res) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

  const targets = await Stock.findAll({
    where: {
      [Op.or]: [
        { updatedAt: { [Op.lt]: twelveHoursAgo } },
        { price: null }
      ]
    }
  });

  for (const stock of targets) {
    const cmd = `python3 scripts/analyze.py ${stock.code}`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) console.error(`[${stock.code}] 失敗:`, stderr);
      else console.log(`[${stock.code}] 分析完了`);
    });
  }

  res.redirect("/stocks");
});
app.get('/run-python', (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('銘柄コードが未指定です');

  const cmd = `python3 scripts/analyze.py ${code}`;
  const child = exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`Python実行エラー: ${stderr}`);
      return res.status(500).send(`❌ エラー:\n${stderr || err.message}`);
    }

    console.log(`Python出力:\n${stdout}`);
    res.send(`✅ 実行完了:\n${stdout}`);
  });
});
app.use(express.json()); // JSONボディの解析

app.post('/update-buy-price', async (req, res) => {
  const { code, price } = req.body;
  if (!code || price == null) {
    return res.status(400).json({ status: 'ERROR', message: 'codeとpriceは必須です' });
  }
  try {
    const result = await Stock.update(
      { buy_price: price },
      { where: { code } }
    );
    res.json({ status: 'OK', updated: result });
  } catch (err) {
    console.error('[DB更新エラー]', err);
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});
app.post('/update-sell-price', async (req, res) => {
  const { code, price } = req.body;
  if (!code || price == null) {
    return res.status(400).json({ status: 'ERROR', message: 'codeとpriceは必須です' });
  }
  try {
    const result = await Stock.update(
      { sell_price: price },
      { where: { code } }
    );
    res.json({ status: 'OK', updated: result });
  } catch (err) {
    console.error('[DB更新エラー]', err);
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});
app.post('/update-favorite', async (req, res) => {
  console.log("受信データ:", req.body);
  const { code, favorite } = req.body;
  try {
    const result = await Stock.update({ favorite }, { where: { code } });
    console.log("更新件数:", result[0]); // ← これ追加してみましょう
  } catch (err) {
    console.error('お気に入り更新エラー:', err);
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});
// サーバー起動
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
