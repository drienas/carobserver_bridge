const dotenv = require('dotenv');
const { BasicStrategy } = require('passport-http');
const passport = require('passport');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const FileSync = require('lowdb/adapters/FileSync');
const low = require('lowdb');
const axios = require('axios');

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const AUTHUSER = process.env.AUTHUSER;
const AUTHPASSWORD = process.env.AUTHPASSWORD;
const FEX = process.env.FEX;
const PORT = process.env.PORT || 3333;

passport.use(
  new BasicStrategy((user, pw, done) => {
    try {
      if (user !== AUTHUSER) return done(null, false);
      if (pw !== AUTHPASSWORD) return done(null, false);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

const adapter = new FileSync('./db/data.json');
const db = low(adapter);
db.defaults({ history: [] }).write();

const app = express();
app.use(morgan('[:date] :method :url :status - :response-time ms'));
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send(`Helo World!`);
});

app.post(
  '/carobserver/alterData',
  passport.authenticate('basic', { session: false }),
  (req, res) => {
    const body = req.body;
    if (!Array.isArray(body)) {
      res.status(400).json({ success: false, error: 'Invalid input format' });
      return;
    }
    db.set('history', body).write();
    res.json({ success: true });
  }
);

app.get(
  '/carobserver/getCsv',
  passport.authenticate('basic', { session: false }),
  async (req, res) => {
    let data = db.get('history').value();

    if (!Array.isArray(data) || data.length === 0) {
      res.status(500).json({
        success: false,
        error: 'Internal server error - invalid data',
      });
      return;
    }

    let r = {
      rows: data,
      keep: Object.keys(data[0]),
      cols: Object.keys(data[0])
        .map((x) => ({ [x]: x }))
        .reduce((a, b) => ({ ...a, ...b }), {}),
    };

    r = JSON.parse(JSON.stringify(r));
    let csv = await axios.post(FEX, r);

    csv = csv.data;

    if (!csv.success) {
      res.status(500).json({
        success: false,
        error: 'Internal server error - error creating csv',
      });
      return;
    }

    let url = csv.uri;

    let buffer = await axios.get(url, { responseType: 'arraybuffer' });
    buffer = buffer.data;

    res.set('Content-Type', 'text/csv');
    res.status(200).send(buffer);
  }
);

app.listen(PORT, () => console.log(`Server ready @ PORT ${PORT}`));
