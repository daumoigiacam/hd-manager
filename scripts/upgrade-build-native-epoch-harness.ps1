$ErrorActionPreference='Stop'
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME='D:\HD-DEV\gradle'
& 'D:\HD-DEV\gradle\wrapper\dists\gradle-8.14.3-bin\cv11ve7ro1n3o1j4so8xd9n66\gradle-8.14.3\bin\gradle.bat' -p 'test-results/performance-upgrade-20261103/after-query-witness/capacitor-project' :macrobenchmark:assembleBenchmark --offline --no-daemon
exit $LASTEXITCODE
