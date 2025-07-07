const express = require('express');
const router = express.Router();
const { Stock, sequelize } = require('../models/stock'); 

router.get('/', async (req, res) => {
  try {
    const stocks = await Stock.findAll();
    res.render('stocks', { layout: 'layout', stocks, title: `銘柄一覧` }); // ← ここでテンプレートにデータを渡す
  } catch (err) {
    console.error(err);
    res.status(500).send('データ取得エラー');
  }
});

router.get('/:id', async (req, res) => {
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

module.exports = router;
