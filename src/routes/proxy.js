const express = require('express');
const auth = require('../middleware/auth');
const modelAllowlist = require('../middleware/modelAllowlist');
const quota = require('../middleware/quota');
const { proxyToOpenAI } = require('../services/openaiProxy');

const router = express.Router();

router.all('/api/*', auth, modelAllowlist, quota, proxyToOpenAI);

module.exports = router;
