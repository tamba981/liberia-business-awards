const admin = require('firebase-admin');

try {
  let serviceAccount;
  
  // Check for Render.com environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } 
  // Check for local file
  else if (require('fs').existsSync('../serviceAccountKey.json')) {
    serviceAccount = require('../serviceAccountKey.json');
  }
  
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://' + serviceAccount.project_id + '.firebaseio.com'
    });
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.log('⚠️  Firebase service account not found');
  }
} catch (error) {
  console.error('❌ Firebase error:', error.message);
}

module.exports = {
  admin,
  auth: admin.auth ? admin.auth() : null
};