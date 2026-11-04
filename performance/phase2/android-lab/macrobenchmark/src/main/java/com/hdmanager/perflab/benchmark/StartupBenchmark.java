package com.hdmanager.perflab.benchmark;
import android.content.Intent;
import androidx.benchmark.macro.StartupMode;
import androidx.benchmark.macro.StartupTimingMetric;
import androidx.benchmark.macro.CompilationMode;
import androidx.benchmark.macro.junit4.MacrobenchmarkRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Collections;
import kotlin.Unit;

// This instrumented module can target ONLY the generated synthetic package.
// No intent/deep-link extras, credentials or test parameters can retarget it.
@RunWith(AndroidJUnit4.class)
public class StartupBenchmark {
 @Rule public MacrobenchmarkRule rule=new MacrobenchmarkRule();
 private void measure(StartupMode mode){
  rule.measureRepeated("com.hdmanager.perflab",Collections.singletonList(new StartupTimingMetric()),
   new CompilationMode.None(),mode,10,
   scope->{scope.pressHome();return Unit.INSTANCE;},
   scope->{scope.startActivityAndWait(new Intent(Intent.ACTION_MAIN).setPackage("com.hdmanager.perflab").addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));return Unit.INSTANCE;});
 }
 @Test public void coldSyntheticContainer(){measure(StartupMode.COLD);}
 @Test public void warmSyntheticContainer(){measure(StartupMode.WARM);}
}
