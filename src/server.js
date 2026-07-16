const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const proxyRouter = require('./routes/proxy');
const dashboardRouter = require('./routes/dashboard');
const adminRouter = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.redirect('/dashboard/login.html'));

app.use('/api/dashboard', dashboardRouter);
app.use('/dashboard', express.static(path.join(__dirname, '../public')));

app.use('/api/admin', adminRouter);
app.use('/admin', express.static(path.join(__dirname, '../public-admin')));

app.use(proxyRouter);

app.listen(env.port, () => {
  console.log(`llm-proxy-node listening on port ${env.port}`);
});
