"use strict";
let Hapi = require("hapi");
let co = require("co");
let thenifyAll = require("thenify-all");
let superagent = require("superagent");


const accessToken = ""; //you can get it on Dropbox developer console
const pathToWatch = "/tmp"; // path to watch changes (in lower case !!! this is a "feature" of dropboxi)

superagent.Request.prototype.endAsync = function(){
  let self = this;
  return new Promise(function(resolve, reject){
    self.end(function(err, res){
      if(err){
        return reject(err);
      }
      if(res.type === "text/javascript" && Object.keys(res.body).length == 0){
        res.body = JSON.parse(res.text);
      }
      resolve(res);
    });
  });
};

thenifyAll.withCallback(Hapi.Server.prototype, Hapi.Server.prototype);
let server = new Hapi.Server();

server.connection({
  host: process.env.HOST || "localhost",
  port: process.env.PORT || 3000
});


let cursor; //cursor for  current changes


function* getDirectLink(path){
  let res = yield superagent.post("https://api.dropbox.com/1/media/auto" + path)
    .set("Authorization", "Bearer " + accessToken)
    .endAsync();
  return res.body.url;
}

function* processAddedFiles(){
  let res = yield superagent.post("https://api.dropbox.com/1/delta")
    .type("form")
    .send({path_prefix: pathToWatch, cursor: cursor})
    .set("Authorization", "Bearer " + accessToken)
    .endAsync();
  cursor = res.body.cursor;

  let added = res.body.entries.filter(function(e){
    return e[1];
  });

  let results = yield added.map(function(f){ return {path: f[0], direct_link: getDirectLink(f[0]), metadata: f[1]};});

  console.log(results);

  if(res.body.has_more){
    yield processAddedFiles()
  }
}

//for webhooks
server.route({
  method: "POST",
  path: "/webhooks",
  handler: function(request, reply) {
    console.log("POST: %j", request.payload);
    co(processAddedFiles())
    .catch(function(err){
      console.error(err.stack);
    });
    reply("");
  }
});



//required for webhook verification
server.route({
  method: "GET",
  path: "/webhooks",
  handler: function(request, reply) {
    console.log("GET: %j", request.query) ;
    reply(request.query.challenge);
  }
});


co(function*(){
  let res = yield superagent.post("https://api.dropbox.com/1/delta/latest_cursor")
    .type("form")
    .send({path_prefix: pathToWatch}).set("Authorization", "Bearer " + accessToken)
    .endAsync();
  cursor = res.body.cursor; //cursor for latest changes only
  yield server.start();
  console.log("Server is ready");
})
.catch(function(err){
  console.error(err.stack);
});


