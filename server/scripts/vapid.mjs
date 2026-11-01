// Prints a fresh VAPID key pair for Web Push. Put the values into server/.env (never commit them).
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
