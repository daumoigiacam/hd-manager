package com.hdmanager.app;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

// Test subclass: MainActivity/plugin registration and Capacitor remain original.
// This source is never compiled by the HD Manager production Android project.
public class VerificationActivity extends MainActivity {
 private boolean fullyDrawn;
 private android.view.ViewTreeObserver.OnDrawListener readyDrawListener;
 private void removeReadyDrawListener(){
  if(readyDrawListener==null)return;
  android.view.ViewTreeObserver observer=getWindow().getDecorView().getViewTreeObserver();
  if(observer.isAlive())observer.removeOnDrawListener(readyDrawListener);
  readyDrawListener=null;
 }
 private android.content.BroadcastReceiver diagnosticReceiver;
 private void installFailureDiagnosticReceiver(){
  if(!getPackageName().startsWith("com.hdmanager.caplab"))throw new IllegalStateException("Readiness diagnostics require the isolated test package");
  final String action=getPackageName()+".CAPTURE_READINESS";
  diagnosticReceiver=new android.content.BroadcastReceiver(){@Override public void onReceive(android.content.Context context,android.content.Intent intent){
   if(!action.equals(intent.getAction()))return;final String request=intent.getStringExtra("requestId");
   if(request==null||!request.matches("[a-zA-Z0-9-]{1,150}")||getBridge()==null)return;
   // Metadata only: compare both private React branches at the FAILURE time.
   // This never marks a source ready or changes the app's business state.
   String script="(function(){var m=document.querySelector('main[data-hd-module]');if(!m)return{module:null,branches:[]};var key=Object.keys(m).find(function(k){return k.indexOf('__reactFiber$')===0}),first=key&&m[key];function branch(f){var p=null,top=f;for(var depth=0;f&&depth<100;depth++,f=f.return){top=f;var v=f.memoizedProps;if(v&&v.currentUser&&v.serverConfirmedCollectionState&&Array.isArray(v.homeReadinessCollections))p=v;}if(!p)return{observed:false};var state=p.serverConfirmedCollectionState,required=Array.from(new Set(['companies','employees'].concat(p.homeReadinessCollections))),same=Boolean(p.currentUser.companyId&&state.tenantId===p.currentUser.companyId);return{observed:true,rootIsCurrent:Boolean(top&&top.stateNode&&top.stateNode.current===top),scopeMatches:same,required:required,missing:required.filter(function(n){return!same||!state.collections||state.collections[n]!==true})}}return{module:m.getAttribute('data-hd-module'),pending:window.__hdModulePending?window.__hdModulePending(m):null,branches:[branch(first),branch(first&&first.alternate)],probe:window.__hdVerification?{shellMs:window.__hdVerification.homeShellMs,interactiveMs:window.__hdVerification.homeInteractiveMs,dataReadyMs:window.__hdVerification.homeDataReadyMs,errors:window.__hdVerification.errors.length,rejections:window.__hdVerification.rejections}:null}})()";
   getBridge().getWebView().evaluateJavascript(script,raw->{try{org.json.JSONObject value=new org.json.JSONObject();value.put("requestId",request);value.put("nativeUptimeMs",android.os.SystemClock.uptimeMillis());value.put("diagnostic",new org.json.JSONObject(raw));writeStage("verification-fiber-diagnostic.json",value.toString());}catch(Exception error){Log.w("HDVerify","failure-metadata-unavailable");}});
  }};
  android.content.IntentFilter filter=new android.content.IntentFilter(action);
  // Only shell/system callers with DUMP may request this test-only metadata.
  if(android.os.Build.VERSION.SDK_INT>=33)registerReceiver(diagnosticReceiver,filter,android.Manifest.permission.DUMP,null,android.content.Context.RECEIVER_EXPORTED);
  else registerReceiver(diagnosticReceiver,filter,android.Manifest.permission.DUMP,null);
 }
 private synchronized void writeStage(String name,String value){
  android.util.AtomicFile file=null;FileOutputStream output=null;
  try{File directory=getExternalFilesDir(null);if(directory==null)return;file=new android.util.AtomicFile(new File(directory,name));output=file.startWrite();output.write(value.getBytes(StandardCharsets.UTF_8));file.finishWrite(output);}
  catch(Exception e){if(file!=null&&output!=null)file.failWrite(output);Log.w("HDVerify","stage-file-unavailable");}
 }
 private void stage(String value){writeStage("verification-stage.json",value);}
 public class MetricsBridge {
  @JavascriptInterface public void report(String json){if(json.length()<45000){Log.i("HDVerify",json);if(json.contains("\"kind\":\"readiness\""))stage(json);}}
  @JavascriptInterface public void homeDataReady(String json){runOnUiThread(()->{
   if(fullyDrawn){writeNativeReady(json,false);return;}
   if(readyDrawListener!=null)return;
   android.view.View decor=getWindow().getDecorView();
   // Source/commit + two JS animation frames have ALREADY completed. Align
   // the native signal with an actual draw of this unchanged view hierarchy,
   // not an arbitrary UI-thread callback between native frames. No extra
   // badge, fake content, or fabricated data readiness is drawn for the metric.
   readyDrawListener=()->{
    if(fullyDrawn)return;
    fullyDrawn=true;reportFullyDrawn();writeNativeReady(json,true);
    decor.post(()->removeReadyDrawListener());
   };
   decor.getViewTreeObserver().addOnDrawListener(readyDrawListener);
   if(getBridge()!=null)getBridge().getWebView().invalidate();
   decor.requestLayout();decor.invalidate();
  });}
 }
 private void writeNativeReady(String json,boolean observedDraw){
  try{org.json.JSONObject value=new org.json.JSONObject(json);
   value.put("fullyDrawnCalled",fullyDrawn);value.put("nativeDrawObserved",observedDraw);
   value.put("nativeUptimeMs",android.os.SystemClock.uptimeMillis());
   writeStage("verification-ready.json",value.toString());stage(value.toString());
  }catch(Exception error){Log.w("HDVerify","fully-drawn-stage-unavailable");}
 }
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  String initial="{\"kind\":\"activity-created\",\"homeDataReady\":false}";
  stage(initial);writeStage("verification-ready.json",initial);
  getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  WebView.setWebContentsDebuggingEnabled(BuildConfig.VERIFICATION_DIAGNOSTIC);
  if(getBridge()!=null)getBridge().getWebView().addJavascriptInterface(new MetricsBridge(),"HDVerification");
  installFailureDiagnosticReceiver();
 }
 @Override public void onDestroy(){removeReadyDrawListener();if(diagnosticReceiver!=null){unregisterReceiver(diagnosticReceiver);diagnosticReceiver=null;}super.onDestroy();}
}
