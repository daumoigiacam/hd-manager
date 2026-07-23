# HD Manager Performance & Crash Tooling

## Nguyên tắc

- App hiện tại là React + Vite + Capacitor/Electron, không phải React Native.
- Không cài Flipper/React Native runtime vào app vì sẽ tăng dung lượng và có nguy cơ gây lag/crash.
- Dùng công cụ tương đương đúng nền tảng: Android Studio Profiler, React DevTools Profiler, Firebase Performance Monitoring và Firebase Crashlytics.

## Cách bật Performance Monitor trong app

- Local: mở `http://127.0.0.1:5173/?perfCheck=1`.
- Production tạm thời: thêm `?perfCheck=1` hoặc `?firebasePerf=1` khi cần đo.
- ENV:
  - `VITE_PERFORMANCE_MONITOR=true`
  - `VITE_FIREBASE_PERFORMANCE=true`

Trong console có thể chạy:

```js
window.hdPerformanceMonitor.events()
window.hdPerformanceMonitor.download('json')
window.hdPerformanceMonitor.download('csv')
```

## Android Profiler

1. Mở Android Studio.
2. Open project: `D:\quản lý bán hàng 1\android`.
3. Cài app debug/release lên máy thật.
4. Mở tab `Profiler`.
5. Theo dõi:
   - CPU
   - Memory/RAM
   - Energy
   - Network
   - Threads

## React DevTools Profiler

1. Chạy local bằng `npm run dev`.
2. Cài React Developer Tools trên Chrome.
3. Mở tab `Profiler`.
4. Record các màn hình nặng: Đơn hàng, Xuất kho, Báo cáo giao hàng, Khách hàng, Bảng lương.
5. Kết hợp log `react.render` từ `window.hdPerformanceMonitor.events()`.

## Firebase Performance Monitoring

- Web Firebase Performance được bật bằng `VITE_FIREBASE_PERFORMANCE=true` hoặc `?firebasePerf=1`.
- Điều kiện cần có Firebase config production hợp lệ và browser hỗ trợ Performance SDK.
- Firebase Console sẽ hiển thị screen/network/custom trace sau khi có traffic thật.

## Firebase Crashlytics Android

Crashlytics native Android cần file `android/app/google-services.json`.

Sau khi có file này:

1. Đặt file vào `android/app/google-services.json`.
2. Build Android release/debug.
3. Gradle sẽ tự apply Google Services, Crashlytics và Firebase Performance native.
4. Mở Firebase Console > Crashlytics để xem crash theo màn hình/stack.

## KPI trước merge/release

Chạy:

```bash
npm run test:performance
npm run test:stress:big
npm run test:kpi
```

KPI thiết bị thật có thể kiểm bằng cách export log JSON vào `test-results/hd-device-performance-*.json` hoặc truyền biến:

```bash
HD_DEVICE_PERF_LOG=path/to/device-log.json npm run test:kpi
```

Nếu muốn bắt buộc có log thiết bị thật:

```bash
HD_REQUIRE_DEVICE_KPI=true npm run test:kpi
```

Log benchmark trên thiết bị thật là tùy chọn trong CI và khi deploy production. Nếu chưa có `HD_DEVICE_PERF_LOG`, KPI gate chỉ ghi cảnh báo và vẫn tiếp tục. Chỉ đặt `HD_REQUIRE_DEVICE_KPI=true` khi chủ động chạy benchmark trên thiết bị thật và muốn bắt buộc log phải có.

## KPI mục tiêu

| Hạng mục | Mục tiêu |
|---|---:|
| Cold Start | < 2.5 giây |
| Warm Start | < 1 giây |
| Chuyển màn hình | < 300 ms |
| API thường | < 500 ms |
| Re-render không cần thiết | 0 |
| Memory Leak | 0 |
| Crash Rate | < 0.1% |
| ANR | 0 |
| FPS khi cuộn danh sách | khoảng 60 FPS |
| App tự thoát | 0 |
| Đơ giao diện | 0 |
