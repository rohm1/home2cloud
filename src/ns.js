const HOME2CLOUD_AUTH = 'ha-cloud-client-auth';
const MESSAGE_PREFIX = 'forwarded_message_';
const RESPONSE_PREFIX = 'forwarded_response_';

module.exports = {
    HOME2CLOUD_AUTH,
    MESSAGE_PREFIX,
    message: function (id) {
        return MESSAGE_PREFIX + id;
    },
    RESPONSE_PREFIX,
    response: function (id) {
        return RESPONSE_PREFIX + id;
    },
};
