const app = require('express')();
const http = require('http').createServer(app);
const ws = require('ws');
const uuid = require('uuid').v4;
const ns = require('./ns');

const bodyParser = require('body-parser');
app.use(bodyParser.raw({
    inflate: false,
    limit: '10kb',
    type: '*/*'
}));

const SECRET = process.env.SOCKET_SECRET;
const sockets = {};
const authenticatedSockets = {};
const handlers = {};

const wss = new ws.Server({ server: http });
wss.on('connection', (socket, req) => {
    const _uuid = uuid();

    sockets[_uuid] = socket;

    socket.isAlive = true;
    socket.on('pong', function () {
        this.isAlive = true;
    });

    socket.on('close', () => {
        console.log('disconnecting ' + _uuid);
        delete authenticatedSockets[_uuid];
        delete sockets[_uuid];
    });

    socket.on('message', async function (data) {
        let jsonData = {};
        try {
            jsonData = JSON.parse(data);
        } catch (e) {
        }

        if (jsonData.ns === ns.HOME2CLOUD_AUTH) {
            if (jsonData.data && jsonData.data.secret === SECRET) {
                authenticatedSockets[_uuid] = true;
                console.log(_uuid + ' authenticated');
            } else {
                this.terminate();
            }

            return;
        }

        if (authenticatedSockets[_uuid]) {
            data = jsonData;

            if (data.data && data.data.body && data.data.body.type === 'Buffer') {
                try {
                    data.data.body = Buffer.from(data.data.body.data);
                } catch (e) {
                    console.log('failed parsing body');
                }
            }

            if (handlers[data.ns]) {
                handlers[data.ns](data.data);
                delete handlers[data.ns];
                return;
            }

            if (sockets[(data.ns || '').replace(ns.MESSAGE_PREFIX, '')]) {
                sockets[data.ns.replace(ns.MESSAGE_PREFIX, '')].send(data.message);
                return;
            }

            console.log('could not handle response');
        } else {
            withAuthenticatedSockets((socket) => {
                pipe(socket, uuid(), _uuid, {
                    headers: req.headers,
                    method: req.method,
                    originalUrl: req.url,
                    body: data
                })
            });
        }
    });
});

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping(() => {
        });
    });
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

const withAuthenticatedSockets = (fn) => {
    Object.keys(authenticatedSockets).forEach((_uuid) => {
       fn(sockets[_uuid]);
    });
};

const pipe = (socket, event_uuid, socket_uuid, req) => {
    const headers = req.headers;
    delete headers.host;
    delete headers['x-forwarded-proto'];
    delete headers['x-forwarded-for'];
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-server'];

    let body = '';
    if (typeof req.body === 'string') {
        body = req.body;
    } else if (Buffer.isBuffer(req.body)) {
        body = req.body.toString();
    }

    socket.send(JSON.stringify({
        event_uuid,
        socket_uuid,
        data: {
            method: req.method || 'GET',
            path: req.originalUrl,
            headers,
            body
        }
    }));
};

const forwardRequest = async (req, socket_uuid) => {
    const promises = [];

    withAuthenticatedSockets((socket) => {
        promises.push(new Promise((resolve, reject) => {
            const event_uuid = uuid();

            const resolveTimeout = setTimeout(() => {
                reject({error: 'no response'});
            }, 10000);

            handlers[ns.response(event_uuid)] = (data) => {
                clearTimeout(resolveTimeout);
                resolve(data);
            };

            pipe(socket, event_uuid, socket_uuid, req);
        }));
    });

    return await Promise.all(promises)
        .then((data) => {
            return data[0] || {};
        })
        .catch((data) => {
            return {
                error: data && data.error ? data.error : 'unknown'
            };
        });
};

app.all('*', async (req, res) => {
    let response = await forwardRequest(req);
    res.set(response.headers);
    res.send(response.body);
});

http.listen(80, () => {
    console.log('listening on *:80');
});
