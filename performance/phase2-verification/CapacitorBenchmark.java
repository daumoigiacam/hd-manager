package com.hdmanager.caplab.benchmark;
import android.content.Intent;
import android.os.SystemClock;
import androidx.benchmark.macro.StartupMode;
import androidx.benchmark.macro.StartupTimingMetric;
import androidx.benchmark.macro.CompilationMode;
import androidx.benchmark.macro.junit4.MacrobenchmarkRule;
import androidx.benchmark.macro.MacrobenchmarkScope;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiSelector;
import androidx.test.uiautomator.UiObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Collections;
import kotlin.Unit;

@RunWith(AndroidJUnit4.class)
public class CapacitorBenchmark {
 private static final String APP="com.hdmanager.caplab";
 @Rule public MacrobenchmarkRule rule=new MacrobenchmarkRule();
 private final String runId=java.util.UUID.randomUUID().toString();
 private java.io.File outputDirectory(){
  String requested=androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("additionalTestOutputDir");
  if(requested!=null){
   if(!requested.startsWith("/sdcard/Android/media/"+APP+".benchmark/")||requested.contains(".."))throw new AssertionError("Unsafe benchmark output directory");
   java.io.File scoped=new java.io.File(requested);if(!scoped.isDirectory()&&!scoped.mkdirs())throw new AssertionError("Cannot create benchmark output directory");return scoped;
  }
  java.io.File directory=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getContext().getExternalFilesDir(null);
  if(directory==null)throw new AssertionError("No benchmark output directory");
  return directory;
 }
 private void captureFailure(UiDevice device,String mode,Throwable failure){
  // Test-only artifacts, all against the isolated synthetic package. Preserve
  // the screen and both readiness records instead of weakening the deadline.
  String prefix=mode+"-failure-"+runId+"-"+SystemClock.uptimeMillis();
  try{
   java.io.File directory=outputDirectory();
   org.json.JSONObject value=new org.json.JSONObject();
   value.put("runId",runId);value.put("mode",mode);value.put("iteration",capturedIteration);
   value.put("failure",failure.toString());value.put("uptimeMs",SystemClock.uptimeMillis());
   value.put("ready",device.executeShellCommand("cat /sdcard/Android/data/"+APP+"/files/verification-ready.json"));
   value.put("stage",device.executeShellCommand("cat /sdcard/Android/data/"+APP+"/files/verification-stage.json"));
   value.put("activity",device.executeShellCommand("dumpsys activity activities "+APP));
   value.put("diagnosticRequest",device.executeShellCommand("am broadcast -a "+APP+".CAPTURE_READINESS -p "+APP+" --es requestId "+prefix));
   long diagnosticDeadline=SystemClock.elapsedRealtime()+2000;
   while(SystemClock.elapsedRealtime()<diagnosticDeadline){
    String raw=device.executeShellCommand("cat /sdcard/Android/data/"+APP+"/files/verification-fiber-diagnostic.json");
    try{org.json.JSONObject metadata=new org.json.JSONObject(raw);if(prefix.equals(metadata.optString("requestId"))){value.put("fiberDiagnostic",metadata);break;}}catch(org.json.JSONException notReady){/* Original failure stays recorded even without metadata. */}
    SystemClock.sleep(100);
   }
   try(java.io.FileOutputStream output=new java.io.FileOutputStream(new java.io.File(directory,prefix+".json"))){output.write(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
   device.dumpWindowHierarchy(new java.io.File(directory,prefix+".xml"));
   device.takeScreenshot(new java.io.File(directory,prefix+".png"));
  }catch(Throwable captureError){android.util.Log.w("HDMacro","failure capture unavailable",captureError);}
 }
 private RuntimeException failed(UiDevice device,String mode,Throwable failure){captureFailure(device,mode,failure);return new RuntimeException(failure);}
 private Intent launch(){return new Intent(Intent.ACTION_MAIN).setClassName(APP,"com.hdmanager.app.VerificationActivity").addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);}
 private void loginIfShown(UiDevice device) throws Exception {
  long end=SystemClock.elapsedRealtime()+10000;
  while(SystemClock.elapsedRealtime()<end){
   UiObject field=device.findObject(new UiSelector().className("android.widget.EditText").instance(0));
   if(field.exists()){
    field.setText("0900000001");
    device.findObject(new UiSelector().className("android.widget.EditText").instance(1)).setText("Local-fixture-only-2026!");
    device.findObject(new UiSelector().textContains("Vào Ứng Dụng")).click();return;
   }
   String state=device.executeShellCommand("cat /sdcard/Android/data/"+APP+"/files/verification-ready.json");
   if(state.contains("\"fullyDrawnCalled\":true")){device.waitForIdle();return;}
   SystemClock.sleep(100);
  }
  throw new AssertionError("Neither login inputs nor verified Home appeared on synthetic Capacitor target");
 }
 private void awaitReady(UiDevice device)throws Exception{
  long end=SystemClock.elapsedRealtime()+30000;
  while(SystemClock.elapsedRealtime()<end){
   String state=device.executeShellCommand("cat /sdcard/Android/data/"+APP+"/files/verification-ready.json");
   if(state.contains("\"fullyDrawnCalled\":true")){device.waitForIdle();return;}
   SystemClock.sleep(100);
  }throw new AssertionError("Source/commit/projection Home contract did not complete; no fabricated TTFD");
 }
 private int capturedIteration=0;
 private void captureStage(UiDevice device,String mode,long iterationStartedUptimeMs)throws Exception{
  String state=device.executeShellCommand("cat /sdcard/Android/data/"+APP+"/files/verification-ready.json");
  org.json.JSONObject value=new org.json.JSONObject();
  value.put("mode",mode);value.put("iteration",capturedIteration);value.put("runId",runId);
  org.json.JSONObject stage=new org.json.JSONObject(state);value.put("stage",stage);value.put("iterationStartedUptimeMs",iterationStartedUptimeMs);value.put("capturedUptimeMs",SystemClock.uptimeMillis());
  boolean newReady=stage.optLong("nativeUptimeMs",-1)>=iterationStartedUptimeMs;value.put("readyObservedDuringIteration",newReady);
  value.put("nativeDrawObservedDuringIteration",newReady&&stage.optBoolean("nativeDrawObserved",false));
  value.put("fullLoginTimingVerified",newReady&&stage.optString("anchor").startsWith("trusted-login-"));
  java.io.File directory=outputDirectory();
  try(java.io.FileOutputStream output=new java.io.FileOutputStream(new java.io.File(directory,mode+"-stages-"+runId+".jsonl"),capturedIteration>0)){
   output.write((value.toString()+"\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }
  capturedIteration++;
 }
 @Test public void coldSyntheticPasswordLogin(){
  rule.measureRepeated(APP,Collections.singletonList(new StartupTimingMetric()),new CompilationMode.None(),StartupMode.COLD,5,
   scope->{try{scope.getDevice().executeShellCommand("pm clear "+APP);scope.pressHome();return Unit.INSTANCE;}catch(Exception e){throw new RuntimeException(e);}},
   scope->{try{long started=SystemClock.uptimeMillis();scope.startActivityAndWait(launch());loginIfShown(scope.getDevice());awaitReady(scope.getDevice());captureStage(scope.getDevice(),"cold",started);return Unit.INSTANCE;}catch(Throwable e){throw failed(scope.getDevice(),"cold-measure",e);}});
 }
 @Test public void warmSyntheticPasswordLogin(){
  rule.measureRepeated(APP,Collections.singletonList(new StartupTimingMetric()),new CompilationMode.None(),StartupMode.WARM,5,
   scope->{try{scope.startActivityAndWait(launch());loginIfShown(scope.getDevice());awaitReady(scope.getDevice());scope.pressHome();return Unit.INSTANCE;}catch(Throwable e){throw failed(scope.getDevice(),"warm-setup",e);}},
   scope->{try{long started=SystemClock.uptimeMillis();scope.startActivityAndWait(launch());loginIfShown(scope.getDevice());awaitReady(scope.getDevice());captureStage(scope.getDevice(),"warm",started);return Unit.INSTANCE;}catch(Throwable e){throw failed(scope.getDevice(),"warm-measure",e);}});
 }
}
