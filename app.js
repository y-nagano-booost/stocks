// app.js（Express の設定ファイルなど）
const express = require('express');
const moment = require('moment');
const { sequelize, Stock } = require('./models/stock');  // 先ほど作成したファイルからインポート

const app = express();

// ビュー全体で moment() が使えるように
app.locals.moment = moment;

// 他のルート設定、ミドルウェア等…
const port = 3000;

app.use(express.static('public'));

// MySQL接続確認とテーブルの同期
sequelize.authenticate()
  .then(() => {
    console.log('Connected to the database.');
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
// ルートの分割読み込み
const stocksRoutes = require('./routes/stocks');
app.use('/stocks', stocksRoutes);

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
    await delay(300); // 300ミリ秒ずつ間隔を空ける
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
app.post('/update-shares', async (req, res) => {
  const { code, shares } = req.body;
  if (!code || shares == null) {
    return res.status(400).json({ status: 'ERROR', message: 'codeとsharesは必須です' });
  }
  try {
    await Stock.update({ shares }, { where: { code } });
    res.json({ status: 'OK', code, shares });
  } catch (err) {
    console.error('[保有株数更新エラー]', err);
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});
app.post('/update-favorite', async (req, res) => {
  console.log("受信データ:", req.body);
  const { code, favorite } = req.body;
  try {
    const result = await Stock.update({ favorite }, { where: { code } });
    console.log("更新件数:", result[0]); // ← これ追加してみましょう
    res.json({ status: 'OK', updated: result[0] });
  } catch (err) {
    console.error('お気に入り更新エラー:', err);
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});
// サーバー起動
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
