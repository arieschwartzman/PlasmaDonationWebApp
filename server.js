require('dotenv').config();
const defaultLocale = 'en-US';
const localeRegExPattern = /^[a-z]{2}(-[A-Z]{2})?$/;
const crypto = require('crypto');
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const rp = require("request-promise");
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const randomstring = require("randomstring");
const azure = require('azure-storage');

const WEBCHAT_SECRET = process.env.WEBCHAT_SECRET;
const DIRECTLINE_ENDPOINT_URI = process.env.DIRECTLINE_ENDPOINT_URI;
const APP_SECRET = process.env.APP_SECRET;
const STORAGE_CONNECTION_STRING= process.env.STORAGE_CONNECTION_STRING;

const directLineTokenEp = `https://${DIRECTLINE_ENDPOINT_URI || "directline.botframework.com"}/v3/directline/tokens/generate`;

// Initialize the web app instance,
const app = express();
app.use(cookieParser());
app.use(bodyParser.json());
// Indicate which directory static resources
// (e.g. stylesheets) should be served from.
app.use(express.static(path.join(__dirname, "public")));
// begin listening for requests.
const port = process.env.PORT || 8080;
const region = process.env.REGION || "Unknown";

app.listen(port, function() {
    console.log("Express server listening on port " + port);
});

function isUserAuthenticated(){
    // add here the logic to verify the user is authenticated
    return true;
}

function getValidatedLocale(loc) {
    if (loc.search(localeRegExPattern) === 0) {
        return loc;
    }
    return defaultLocale;
}

const appConfig = {
    isHealthy : false,
    options : {
        method: 'POST',
        uri: directLineTokenEp,
        headers: {
            'Authorization': 'Bearer ' + WEBCHAT_SECRET
        },
        json: true
    }
};

function healthResponse(res, statusCode, message) {
    res.status(statusCode).send({
        health: message,
        region: region
    });
}
function healthy(res) {
    healthResponse(res, 200, "Ok");
}

function unhealthy(res) {
    healthResponse(res, 503, "Unhealthy");
}

app.get('/health', function(req, res){
    if (!appConfig.isHealthy) {
        rp(appConfig.options)
            .then((body) => {
                appConfig.isHealthy = true;
                healthy(res);
            })
            .catch((err) =>{
                unhealthy(res);
            });
    }
    else {
        healthy(res);
    }
});

const tableService = azure.createTableService(STORAGE_CONNECTION_STRING);

app.post('/save', function(req, res) {
   const key = randomstring.generate({
       length:7,       
       charset:"numeric"             
   });
   
  var task = {
    PartitionKey : {'_': 'donationrequest', '$':'Edm.String'},
    RowKey: {'_': key, '$':'Edm.String'},
    name: {'_': req.body.name, '$':'Edm.String'},
    email: {'_': req.body.email,'$':'Edm.String'},
    phone: {'_': req.body.phone, '$':'Edm.String'},
    state: {'_': req.body.state ,'$':'Edm.String'},
    city: {'_': req.body.city, '$':'Edm.String'},
    gender:{'_': req.body.gender, '$':'Edm.String'},
    donationcenter: {'_': req.body.center, '$':'Edm.String'},
    age:{'_': req.body.age, '$':'Edm.String'},
    tattoo:{'_': req.body.tattoo, '$':'Edm.String'},
    medication:{'_': req.body.medication, '$':'Edm.String'},
    surgery:{'_': req.body.surgery, '$':'Edm.String'},
    weight:{'_': req.body.weight, '$':'Edm.String'},
    zipcode:{'_': req.body.zipcode, '$':'Edm.String'}
  };
  
  tableService.insertEntity("donationrequests", task, function(err) {      
    if (err) {
        res.status(500).send(err.message);
    }
    else {        
        res.status(200).send({key});         
    }
  });
});


app.post('/chatBot',  function(req, res) {
    if (!isUserAuthenticated()) {
        res.status(403).send();
        return;
    }
    rp(appConfig.options)
        .then(function (parsedBody) {
            var userid = req.query.userId || req.cookies.userid;
            if (!userid) {
                userid = crypto.randomBytes(4).toString('hex');
                res.cookie("userid", userid);
            }

            var response = {};
            response['userId'] = userid;
            response['userName'] = req.query.userName;
            response['locale'] = getValidatedLocale(req.query.locale);
            response['connectorToken'] = parsedBody.token;

            /*
            //Add any additional attributes
            response['optionalAttributes'] = {age: 33};
            */

            if (req.query.lat && req.query.long)  {
                response['location'] = {lat: req.query.lat, long: req.query.long};
            }
            response['directLineURI'] = DIRECTLINE_ENDPOINT_URI;
            const jwtToken = jwt.sign(response, APP_SECRET);
            res.send(jwtToken);
        })
        .catch(function (err) {
            appConfig.isHealthy = false;
            res.status(err.statusCode).send();
            console.log("failed");
        });
});
