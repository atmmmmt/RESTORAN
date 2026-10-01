'use strict';

const router = require('express').Router();
const { protect } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.get('/me', protect, authController.getMe);

module.exports = router;
