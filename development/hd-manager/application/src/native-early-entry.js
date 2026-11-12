import './services/legacyRuntime.js';
import {getNativeStartupController} from './services/nativeStartupController.js';
// Existing signed-session/bootstrap implementation, no React or second database.
getNativeStartupController();
