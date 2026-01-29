const admin = require('firebase-admin');

try {
  let serviceAccount;
  
  // Option 1: Check for Render.com environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('📦 Loading Firebase from Render environment variable');
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } 
  // Option 2: Check for local file (development)
  else {
    console.log('🔧 Loading Firebase from local file');
    try {
      serviceAccount = require('../serviceAccountKey.json');
    } catch (e) {
      console.log('⚠️  No local Firebase config found');
    }
  }
  
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
      storageBucket: `${serviceAccount.project_id}.appspot.com`
    });
    
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.log('⚠️  Firebase service account not found - running without Firebase');
  }
  
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
}

// Export Firebase services
module.exports = {
  admin,
  auth: admin.auth ? admin.auth() : null,
  db: admin.firestore ? admin.firestore() : null,
  storage: admin.storage ? admin.storage() : null
};
