var ERR = require('async-stacktrace');

var config = require('../lib/config');
var csrf = require('../lib/csrf');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    res.locals.is_administrator = false;

    if (req.method === 'OPTIONS') {
        // don't authenticate for OPTIONS requests, as these are just for CORS
        next();
        return;
    }

    if (/^\/pl\/webhooks\//.test(req.path)) {
      // Webhook callbacks should not be authenticated
      next();
      return;
    }

    // bypass auth for local /pl/ serving
    if (config.authType === 'none') {
        var authUid = 'dev@illinois.edu';
        var authName = 'Dev User';
        var authUin = '000000000';

        if (req.cookies.pl_test_user == 'test_student') {
            authUid = 'student@illinois.edu';
            authName = 'Student User';
            authUin = '000000001';
        }
        let params = {
            uid: authUid,
            name: authName,
            uin: authUin,
            provider: 'dev',
        };
        sqldb.queryOneRow(sql.insert_user, params, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.authn_user = result.rows[0].user;
            res.locals.is_administrator = result.rows[0].is_administrator;
            next();
        });
        return;
    }

    // otherwise look for auth cookies
    if (req.cookies.pl_authn == null) {
        logger.error('no authn cookie');
        res.redirect('/');
        return;
    }
    var authnData = csrf.getCheckedData(req.cookies.pl_authn, config.secretKey, {maxAge: 24 * 60 * 60 * 1000});
    if (authnData == null) {
        // if CSRF checking failed then clear the cookie and redirect to / to prompt re-login
        logger.error('authn cookie CSRF failure');
        res.clearCookie('pl_authn');
        res.redirect('/');
        return;
    }

    let params = {
        user_id: authnData.user_id,
    };
    sqldb.query(sql.select_user, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(new Error('user not found with user_id ' + authnData.user_id));
        res.locals.authn_user = result.rows[0].user;
        res.locals.is_administrator = result.rows[0].is_administrator;
        next();
    });
};
