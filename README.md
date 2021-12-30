# home2cloud

Allow you to publish a service hosted on a private network to the web.

## How it works

This is made to run in docker. All options are set in the `.env` file (copy `.env.dist` and write your options). You'll need to deploy this project twice, once on your webserver (`server` instance run with `docker-compose -f docker-compose.server.yml up -d`), and once on you local network (`client` instance run with `docker-compose -f docker-compose.client.yml up -d`). The server instance forwards the HTTP calls to the client instance. The client instance acts as a proxy between the server instance and your private service. You do not need to open any port on your local network. Instead, the server instance waits for a websocket connection from the client instance.

The server instance does not handle SSL, so place it behind a reverse proxy.

```
     |--webserver--------------------------|  |--private network----------------------|
     |                                     |  |                                       |
     |  |-----------------|  |----------|  |  |  |----------|  |-------------------|  |
─web─|──|──reverse proxy──|──|──server──|──|──|──|──client──|──|──private service  |  |
     |  |-----------------|  |----------|  |  |  |----------|  |-------------------|  |
     |                                     |  |                                       |
     |-------------------------------------|  |---------------------------------------|
```

## Options

### Global options
- `SOCKET_SECRET`: shared secret used to authenticate the client to the server

### Server options
- `HTTP_PORT`: public port for the server. Can be set with IP, i.e. `127.0.0.1:1234`

### Client options
- `LOCAL_SERVER_URL`: private service URL on your network
- `SERVER_URL`: public domain of the client. Used to rewrite headers
- `WEBSOCKET_URL`: URL of the client (wss://my.public.domain/)
