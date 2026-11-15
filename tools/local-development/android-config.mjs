// The native assets belong to Local, even when the last root Android build was
// QA/Production. Never inherit that build's WebView hostname or remote server.
export function localAndroidCapacitorConfig(input){
 if(!input||typeof input!=='object'||input.server?.url)throw Error('Local APK requires bundled assets, not a remote server');
 return {...input,appId:'com.hdmanager.app.localdev',appName:'HD Manager Local Development',loggingBehavior:'none',
  android:{...input.android,loggingBehavior:'none'},
  server:{hostname:'localhost',androidScheme:'http',cleartext:true}};
}
