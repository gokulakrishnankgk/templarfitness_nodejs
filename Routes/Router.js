const express = require('express');
const router = express.Router();
const FFMPEGVideoConversion = require('../Controller/FFMPEGVideoConversion');

router.get('/', (req, res) =>  FFMPEGVideoConversion.handle());

module.exports = router;