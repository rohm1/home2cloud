if (!process.env.SOCKET_SECRET) {
    throw new Error('no secret set');
}

if (process.env.MODE === 'server') {
    require('./server');
} else if (process.env.SERVER_URL === 'client') {
    require('./client');
} else {
    throw new Error('process.env.SERVER_URL should be "client" or "server", got ' + process.env.SERVER_URL);
}
