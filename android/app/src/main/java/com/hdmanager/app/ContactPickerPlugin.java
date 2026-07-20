package com.hdmanager.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.text.TextUtils;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(
    name = "ContactPicker",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts")
    }
)
public class ContactPickerPlugin extends Plugin {

    @PluginMethod
    public void getContactsPermissionState(PluginCall call) {
        call.resolve(buildPermissionPayload());
    }

    @PluginMethod
    public void requestContactsPermission(PluginCall call) {
        if (isContactsPermissionGranted()) {
            call.resolve(buildPermissionPayload());
            return;
        }

        requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        if (!isContactsPermissionGranted()) {
            requestPermissionForAlias("contacts", call, "contactsPermissionAndPickCallback");
            return;
        }

        launchContactPicker(call);
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        call.resolve(buildPermissionPayload());
    }

    @PermissionCallback
    private void contactsPermissionAndPickCallback(PluginCall call) {
        if (!isContactsPermissionGranted()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("supported", true);
            result.put("cancelled", false);
            result.put("message", "Ứng dụng chưa được cấp quyền danh bạ.");
            result.put("permissions", buildPermissionPayload());
            call.resolve(result);
            return;
        }

        launchContactPicker(call);
    }

    @ActivityCallback
    private void pickContactResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) {
            return;
        }

        if (activityResult == null || activityResult.getResultCode() != Activity.RESULT_OK) {
            call.resolve(buildCancelledPayload());
            return;
        }

        Intent data = activityResult.getData();
        Uri contactUri = data != null ? data.getData() : null;
        if (contactUri == null) {
            call.resolve(buildCancelledPayload());
            return;
        }

        try {
            call.resolve(readSelectedContact(contactUri));
        } catch (Exception error) {
            call.reject("Không thể đọc dữ liệu từ danh bạ điện thoại.", error);
        }
    }

    private void launchContactPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI);
        startActivityForResult(call, intent, "pickContactResult");
    }

    private JSObject readSelectedContact(Uri contactUri) {
        ContentResolver resolver = getContext().getContentResolver();

        String contactId = "";
        String name = "";
        int hasPhoneNumber = 0;

        String[] projection = new String[] {
            ContactsContract.Contacts._ID,
            ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
            ContactsContract.Contacts.HAS_PHONE_NUMBER
        };

        try (Cursor cursor = resolver.query(contactUri, projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                contactId = getStringSafely(cursor, ContactsContract.Contacts._ID);
                name = getStringSafely(cursor, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY);
                hasPhoneNumber = getIntSafely(cursor, ContactsContract.Contacts.HAS_PHONE_NUMBER);
            }
        }

        String phone = "";
        if (!TextUtils.isEmpty(contactId) && hasPhoneNumber > 0) {
            phone = readPrimaryPhone(resolver, contactId);
        }

        String address = "";
        if (!TextUtils.isEmpty(contactId)) {
            address = readPrimaryAddress(resolver, contactId);
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("supported", true);
        result.put("cancelled", false);
        result.put("name", safeTrim(name));
        result.put("phone", safeTrim(phone));
        result.put("address", safeTrim(address));
        result.put("message", "Đã lấy thông tin liên hệ từ danh bạ.");
        result.put("permissions", buildPermissionPayload());
        return result;
    }

    private String readPrimaryPhone(ContentResolver resolver, String contactId) {
        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.IS_PRIMARY,
            ContactsContract.CommonDataKinds.Phone.IS_SUPER_PRIMARY
        };
        String selection = ContactsContract.CommonDataKinds.Phone.CONTACT_ID + "=?";
        String[] selectionArgs = new String[] { contactId };
        String sortOrder =
            ContactsContract.CommonDataKinds.Phone.IS_SUPER_PRIMARY + " DESC, " +
            ContactsContract.CommonDataKinds.Phone.IS_PRIMARY + " DESC, " +
            ContactsContract.CommonDataKinds.Phone._ID + " ASC";

        try (Cursor cursor = resolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            sortOrder
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                return getStringSafely(cursor, ContactsContract.CommonDataKinds.Phone.NUMBER);
            }
        }
        return "";
    }

    private String readPrimaryAddress(ContentResolver resolver, String contactId) {
        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.StructuredPostal.FORMATTED_ADDRESS,
            ContactsContract.CommonDataKinds.StructuredPostal.STREET,
            ContactsContract.CommonDataKinds.StructuredPostal.CITY,
            ContactsContract.CommonDataKinds.StructuredPostal.REGION,
            ContactsContract.CommonDataKinds.StructuredPostal.COUNTRY,
            ContactsContract.CommonDataKinds.StructuredPostal.POSTCODE,
            ContactsContract.CommonDataKinds.StructuredPostal.IS_PRIMARY,
            ContactsContract.CommonDataKinds.StructuredPostal.IS_SUPER_PRIMARY
        };
        String selection = ContactsContract.CommonDataKinds.StructuredPostal.CONTACT_ID + "=?";
        String[] selectionArgs = new String[] { contactId };
        String sortOrder =
            ContactsContract.CommonDataKinds.StructuredPostal.IS_SUPER_PRIMARY + " DESC, " +
            ContactsContract.CommonDataKinds.StructuredPostal.IS_PRIMARY + " DESC, " +
            ContactsContract.CommonDataKinds.StructuredPostal._ID + " ASC";

        try (Cursor cursor = resolver.query(
            ContactsContract.CommonDataKinds.StructuredPostal.CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            sortOrder
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                String formattedAddress = getStringSafely(cursor, ContactsContract.CommonDataKinds.StructuredPostal.FORMATTED_ADDRESS);
                if (!TextUtils.isEmpty(formattedAddress)) {
                    return formattedAddress;
                }

                List<String> parts = new ArrayList<>();
                addIfNotBlank(parts, getStringSafely(cursor, ContactsContract.CommonDataKinds.StructuredPostal.STREET));
                addIfNotBlank(parts, getStringSafely(cursor, ContactsContract.CommonDataKinds.StructuredPostal.CITY));
                addIfNotBlank(parts, getStringSafely(cursor, ContactsContract.CommonDataKinds.StructuredPostal.REGION));
                addIfNotBlank(parts, getStringSafely(cursor, ContactsContract.CommonDataKinds.StructuredPostal.POSTCODE));
                addIfNotBlank(parts, getStringSafely(cursor, ContactsContract.CommonDataKinds.StructuredPostal.COUNTRY));
                return TextUtils.join(", ", parts);
            }
        }
        return "";
    }

    private void addIfNotBlank(List<String> parts, String value) {
        String trimmed = safeTrim(value);
        if (!TextUtils.isEmpty(trimmed)) {
            parts.add(trimmed);
        }
    }

    private JSObject buildCancelledPayload() {
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("supported", true);
        result.put("cancelled", true);
        result.put("message", "Bạn chưa chọn liên hệ nào trong danh bạ.");
        result.put("permissions", buildPermissionPayload());
        return result;
    }

    private JSObject buildPermissionPayload() {
        JSObject result = new JSObject();
        String contactsState = "missing";
        boolean granted = isContactsPermissionGranted();

        if (isPermissionDeclared("contacts")) {
            PermissionState state = getPermissionState("contacts");
            contactsState = granted ? "granted" : state.toString().toLowerCase(Locale.ROOT);
        }

        result.put("contacts", contactsState);
        result.put("granted", granted);
        return result;
    }

    private boolean isContactsPermissionGranted() {
        return ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private String getStringSafely(Cursor cursor, String columnName) {
        int index = cursor.getColumnIndex(columnName);
        if (index < 0 || cursor.isNull(index)) return "";
        return cursor.getString(index);
    }

    private int getIntSafely(Cursor cursor, String columnName) {
        int index = cursor.getColumnIndex(columnName);
        if (index < 0 || cursor.isNull(index)) return 0;
        return cursor.getInt(index);
    }

    private String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }
}
