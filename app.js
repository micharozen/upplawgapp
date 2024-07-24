const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const {authenticate} = require('@google-cloud/local-auth');
const path = require('path');
const fs = require('fs');

// Configure the Google Drive API client
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

const app = express();
app.use(bodyParser.json());

// Load or request authorization to call APIs
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

// Load saved credentials if they exist
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.promises.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

// Save the credentials to a file
async function saveCredentials(client) {
  const content = await fs.promises.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.promises.writeFile(TOKEN_PATH, payload);
}

app.post('/upload', async (req, res) => {
  const { fileName, parentId, mimeType } = req.body;
  console.log('Received Request Body:', req.body);

  if (!fileName || !parentId || !mimeType) {
    console.log('Missing required fields:', { fileName, parentId, mimeType });
    return res.status(400).send('Missing required fields');
  }

  try {
    const auth = await authorize();
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: fileName,
      parents: [parentId],
    };

    // Specify the path to the local file
    const filePath = path.join(__dirname, 'notion.pdf');
    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
    });

    res.status(200).send(`File uploaded with ID: ${response.data.id}`);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Failed to upload file');
  }
});

app.get('/oauth2callback', async (req, res) => {
    try {
      const code = req.query.code;
      const client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
        code: code
      });
      await saveCredentials(client);
      res.status(200).send('Authentication successful! Please return to the console.');
    } catch (error) {
      console.error('Error during OAuth2 callback:', error);
      res.status(500).send('Authentication failed');
    }
  });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});