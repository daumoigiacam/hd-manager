package com.hdmanager.caplab.benchmark;
import android.content.Intent;
import android.os.SystemClock;
import androidx.benchmark.macro.junit4.BaselineProfileRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiSelector;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import kotlin.Unit;

// Isolated collection pilot only. This is not shipped in the product APK.
@RunWith(AndroidJUnit4.class)
public class CapacitorBaselineProfile {
 private static final String APP="com.hdmanager.caplab";
 @Rule public BaselineProfileRule rule=new BaselineProfileRule();
 @Test public void collectSyntheticStartup(){
  rule.collect(APP,5,3,"hdm-upgrade",false,false,
   line->!line.contains("com/hdmanager/app/VerificationActivity"),
   scope->{try{
    scope.pressHome();
    scope.startActivityAndWait(new Intent(Intent.ACTION_MAIN).setClassName(APP,"com.hdmanager.app.VerificationActivity").addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    UiDevice device=scope.getDevice();long end=SystemClock.elapsedRealtime()+30000;boolean submitted=false;
    while(SystemClock.elapsedRealtime()<end){
     if(!submitted&&device.findObject(new UiSelector().className("android.widget.EditText").instance(0)).exists()){
      device.findObject(new UiSelector().className("android.widget.EditText").instance(0)).setText("0900000001");
      device.findObject(new UiSelector().className("android.widget.EditText").instance(1)).setText("Local-fixture-only-2026!");
      device.findObject(new UiSelector().textContains("Vào Ứng Dụng")).click();submitted=true;
     }
     String state=device.executeShellCommand("cat /sdcard/Android/data/"+APP+"/files/verification-ready.json");
     if(state.contains("\"fullyDrawnCalled\":true"))return Unit.INSTANCE;
     SystemClock.sleep(100);
    }
    throw new AssertionError("Synthetic Home did not become ready during profile collection");
   }catch(Exception error){throw new RuntimeException(error);}});
 }
}
