// Design for a separate androidTest module. NOT compiled/installed yet.
// Dependency version must be pinned and resolved in an isolated test module
// before this source becomes executable. Never target a real account/package.
package com.hdmanager.perfdesign

import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupDesign {
    @get:Rule val rule = MacrobenchmarkRule()
    @Test fun isolatedFixtureColdStart() = rule.measureRepeated(
        packageName = "com.hdmanager.perflab",
        metrics = listOf(StartupTimingMetric()),
        iterations = 10,
        startupMode = StartupMode.COLD,
        setupBlock = { pressHome() },
    ) { startActivityAndWait() }
}
