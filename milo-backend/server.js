// ENDPOINTS

// GET auth endpoint
app.get('/auth', function (req, res)
{
    let options = {
        loginHint: 'test@nylas.com',
        redirectURI: 'http://localhost:3000/callback',
        scopes: ['calendar'],
    };

    // Redirect user to the auth_url
    let auth_url = Nylas.urlForAuthentication(options);
    res.redirect(auth_url);
});

// GET callback endpoint
app.get('/callback', function (req, res)
{
    // return challenge if sent
    if (req.query.challenge) {
        res.status(200).send(req.query.challenge);
    }
    // exchange one-time-code for access token
    let NYLAS_CODE = req.query.code;
    Nylas.exchangeCodeForToken(NYLAS_CODE).then(function(resp) {
        // use the access code to authenticate the user
        let access_token = resp;
        console.log("access token: " + access_token);
    });
});

// TODO: do async
app.post('/callback', function (req, res)
{
    res.status(200);
    req.body.deltas.forEach(delta => {
        console.log(delta.type, delta.object_data);
    });
});

app.get('/events', function (req, res)
{
    //let nylas = Nylas.with(ACCESS_TOKEN);
});