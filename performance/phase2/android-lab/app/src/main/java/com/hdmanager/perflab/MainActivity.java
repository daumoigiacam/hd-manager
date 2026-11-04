package com.hdmanager.perflab;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.util.Log;
import java.io.ByteArrayInputStream;

// Isolated diagnostic container, NOT the Capacitor production shell and NOT
// a replacement for AndroidX Macrobenchmark on a release HD Manager candidate.
public class MainActivity extends Activity {
 private WebView view;
 @Override public void onCreate(Bundle state){
  super.onCreate(state); view=new WebView(this);setContentView(view);
  view.getSettings().setJavaScriptEnabled(true);view.getSettings().setDomStorageEnabled(true);
  view.getSettings().setBlockNetworkLoads(true); // no INTERNET permission either
  WebView.setWebContentsDebuggingEnabled(false);
  view.addJavascriptInterface(new Object(){
   @JavascriptInterface public void metrics(String value){if(value.length()<16000)Log.i("HDPerfLab",value);}
   @JavascriptInterface public void fullyDrawn(){runOnUiThread(()->reportFullyDrawn());}
  },"HDPerfLab");
  view.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView web,WebResourceRequest request){
    String host=request.getUrl().getHost(),p=request.getUrl().getPath();
    if(!"hd-perf.invalid".equals(host)||p==null||p.contains(".."))return denied();
    try{if(p.equals("/"))p="/index.html";
     String mime=p.endsWith(".js")?"text/javascript":p.endsWith(".css")?"text/css":p.endsWith(".svg")?"image/svg+xml":p.endsWith(".png")?"image/png":"text/html";
     return new WebResourceResponse(mime,"UTF-8",getAssets().open("public"+p));
    }catch(Exception error){return denied();}
   }
   private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("local fixture only".getBytes()));}
  });
  view.loadUrl("https://hd-perf.invalid/"+(getIntent().getBooleanExtra("soak",false)?"?soak=1":""));
 }
 @Override public void onDestroy(){if(view!=null){view.removeJavascriptInterface("HDPerfLab");view.stopLoading();view.destroy();view=null;}super.onDestroy();}
}
