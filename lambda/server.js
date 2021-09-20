const express = require('express');
const { ExpressAdapter } = require('ask-sdk-express-adapter');
const skill = require('./index.js').skill;
const app = express();
const adapter = new ExpressAdapter(skill, true, true);
app.post('/', adapter.getRequestHandlers());
app.listen(3000);