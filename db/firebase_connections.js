const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");


const firebase = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
}, "Firebase");


const connFb = firebase.firestore();

module.exports = {
    connFb: connFb
}
