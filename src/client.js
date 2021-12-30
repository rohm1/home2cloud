const WebSocket = require('ws');
const http = require('http');
const ns = require('./ns');

const SERVER_URL = process.env.SERVER_URL;
const WEBSOCKET_URL = process.env.WEBSOCKET_URL;
const LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL;
const SECRET = process.env.SOCKET_SECRET;

const url = new URL(LOCAL_SERVER_URL);

const http_options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https' ? 443 : 80)
};

const haCloud = new WebSocket(WEBSOCKET_URL);
const sockets = {};

const modifyHeaders = (headers, search, replace) => {
    Object.keys(headers).forEach((headerName) => {
        if (headers[headerName] && headers[headerName].replace) {
            headers[headerName] = headers[headerName].replace(search, replace);
        }
    });

    return headers;
};

function heartbeat() {
    clearTimeout(this.pingTimeout);

    this.pingTimeout = setTimeout(() => {
        this.terminate();
    }, 30000 + 1000);
}

const forwardMessage = (uuid, message) => {
    haCloud.send(JSON.stringify({
        ns: ns.message(uuid),
        message
    }));
};

const forwardResponse = (uuid, headers, body) => {
    haCloud.send(JSON.stringify({
        ns: ns.response(uuid),
        data: {
            headers: modifyHeaders(headers, LOCAL_SERVER_URL, SERVER_URL),
            body
        }
    }));
};

haCloud.on('message', (data) => {
    try {
        data = JSON.parse(data);
    } catch (e) {
        console.log('failed to JSON.parse message', data);
        return;
    }

    if (data.data.headers && data.data.headers.upgrade && data.data.headers.upgrade.toLowerCase() === 'websocket') {
        if (!sockets[data.data.path]) {
            const socket_url = new URL(LOCAL_SERVER_URL);
            socket_url.protocol = socket_url.protocol === 'https:' ? 'wss:' : 'ws:';
            socket_url.pathname = data.data.path;
            const socket = new WebSocket(socket_url.toString());
            sockets[data.data.path] = socket;
            socket.on('message', (message) => {
                forwardMessage(data.socket_uuid, message);
            });
            socket.on('open', function () {
                this.send(data.data.body);
            });
            socket.on('close', function () {
                delete sockets[data.data.path];
            });
        } else {
            sockets[data.data.path].send(data.data.body);
        }
    } else {
        const options = http_options;
        options.method = data.data.method;
        options.path = data.data.path;
        options.headers = data.data.headers;

        const body = options.method === 'POST' || options.method === 'PUT' ? data.data.body : '';
        options.headers['content-length'] = body.length;

        options.headers = modifyHeaders(options.headers, SERVER_URL, LOCAL_SERVER_URL);

        const req = http.request(options, (res) => {
            let response = [];

            res.on('data', (d) => {
                response.push(d)
            });

            res.on('end', () => {
                forwardResponse(data.event_uuid, res.headers, Buffer.concat(response));
            });
        });

        req.on('error', (error) => {
            forwardResponse(data.event_uuid, {}, {error});
        });

        if (body) {
            req.write(decodeURI(body));
        }

        req.end();
    }
});

haCloud.on('open', function () {
    console.log('connected');
    this.send(JSON.stringify({
        ns: ns.HOME2CLOUD_AUTH,
        data: {
            secret: SECRET
        }
    }));
    heartbeat.call(this);
});
haCloud.on('ping', function () {
    heartbeat.call(this);
});
haCloud.on('close', function () {
    clearTimeout(this.pingTimeout);
    console.log('disconnected');
});

