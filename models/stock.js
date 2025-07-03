// models/stock.js

const { Sequelize, DataTypes } = require('sequelize');

// Sequelizeインスタンスを作成します。
// 第一引数: データベース名
// 第二引数: ユーザー名
// 第三引数: パスワード
// host, dialect は環境に合わせて調整してください。
const sequelize = new Sequelize('mydb', 'app_user', 'your_password', {
  host: 'localhost',
  dialect: 'mysql',
  logging: false  // SQLログを見たい場合は console.log に変更
});

// Stockモデル定義
const Stock = sequelize.define('Stock', {
  // 主キー
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // 基本情報
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },

  // テクニカル指標
  rsi: {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  price_date: {
    // YYYY-MM-DD だけ扱うなら DATEONLY
    type: DataTypes.DATEONLY,
    allowNull: true
  },

  // 配当・業績
  last_div_date: {
    // YYYY-MM-DD だけ扱うなら DATEONLY
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  last_div_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  latest_eps: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  latest_rev: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  dividend_yield: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  forward_pe: {
    type: DataTypes.FLOAT,
    allowNull: true
  },

  // 直近４四半期の売上高・純利益
  rev_q1: { type: DataTypes.BIGINT, allowNull: true },
  rev_q2: { type: DataTypes.BIGINT, allowNull: true },
  rev_q3: { type: DataTypes.BIGINT, allowNull: true },
  rev_q4: { type: DataTypes.BIGINT, allowNull: true },
  ni_q1: { type: DataTypes.BIGINT, allowNull: true },
  ni_q2: { type: DataTypes.BIGINT, allowNull: true },
  ni_q3: { type: DataTypes.BIGINT, allowNull: true },
  ni_q4: { type: DataTypes.BIGINT, allowNull: true },
  prev_rev_q1: { type: DataTypes.BIGINT, allowNull: true },
  prev_rev_q2: { type: DataTypes.BIGINT, allowNull: true },
  prev_rev_q3: { type: DataTypes.BIGINT, allowNull: true },
  prev_rev_q4: { type: DataTypes.BIGINT, allowNull: true },
  prev_ni_q1: { type: DataTypes.BIGINT, allowNull: true },
  prev_ni_q2: { type: DataTypes.BIGINT, allowNull: true },
  prev_ni_q3: { type: DataTypes.BIGINT, allowNull: true },
  prev_ni_q4: { type: DataTypes.BIGINT, allowNull: true },
  cat_33_name:{ type: DataTypes.STRING, allowNull: false},
  cat_17_name:{ type: DataTypes.STRING, allowNull: false},
  buy_price: { type: DataTypes.DECIMAL(20, 4), allowNull: true  },
  sell_price: { type: DataTypes.DECIMAL(20, 4), allowNull: true  },
  shares: { type: DataTypes.INTEGER, allowNull: true  },
  favorite: { type: DataTypes.BOOLEAN, allowNull: true  }
}, {
  tableName: 'stocks',   // 実際のテーブル名に合わせる
  timestamps: true       // createdAt / updatedAt を自動管理
});

// テーブルが存在しない場合に作成します（開発用）
// 本番運用ではマイグレーションツールを使ってください。
sequelize.sync()
  // .then(() => console.log('Stocks table synced'))
  .catch(err => console.error('Error syncing Stocks table:', err));

module.exports = { sequelize, Stock };