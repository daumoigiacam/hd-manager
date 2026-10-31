#!/usr/bin/env python3
"""Narrow, hash-guarded repair of the existing app HTTPS vhost; dry-run default."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
from datetime import datetime, timezone

TARGET = Path('/etc/nginx/sites-enabled/app.hdconnect.net')
ANCHOR = '    root /var/www/hd-manager/current;'
BLOCK = '''
    # HD Manager: compress static text assets in this HTTPS vhost only.
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_proxied any;
    gzip_types application/javascript text/javascript application/ecmascript text/ecmascript application/json application/manifest+json application/wasm image/svg+xml text/css text/plain text/xml;
'''


def candidate(source):
    if source.count(ANCHOR) != 1 or len(re.findall(r'server_name\s+app\.hdconnect\.net\s*;', source)) != 2:
        raise ValueError('Unexpected vhost layout; inspect manually')
    if re.search(r'^\s*gzip(?:_[a-z_]+)?\s', source, re.M):
        raise ValueError('Vhost already has gzip directives; inspect manually')
    return source.replace(ANCHOR, ANCHOR + '\n' + BLOCK, 1)


def atomic_write(target, data, metadata):
    # Stage outside sites-enabled: backup/temp files must not become vhosts.
    fd, temporary = tempfile.mkstemp(prefix='.hd-manager-gzip-', dir='/etc/nginx')
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), stat.S_IMODE(metadata.st_mode))
            os.fchown(stream.fileno(), metadata.st_uid, metadata.st_gid)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if TARGET.is_symlink() or TARGET.resolve() != TARGET:
        raise ValueError('Expected the inspected regular vhost file')
    original = TARGET.read_bytes()
    before = hashlib.sha256(original).hexdigest()
    if before != args.expected_sha256:
        raise ValueError('Vhost changed since inspection; refusing mutation')
    updated = candidate(original.decode('utf8')).encode('utf8')
    if not args.apply:
        print(''.join(difflib.unified_diff(original.decode().splitlines(True), updated.decode().splitlines(True), fromfile=str(TARGET), tofile=str(TARGET))))
        return
    if os.geteuid() != 0:
        raise PermissionError('Run --apply via sudo')
    subprocess.run(['nginx', '-t'], check=True)
    metadata = TARGET.stat()
    backup_root = Path('/var/backups/hd-manager-nginx')
    backup_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = backup_root / ('app-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.conf')
    shutil.copy2(TARGET, backup)
    backup.chmod(0o600)
    atomic_write(TARGET, updated, metadata)
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except BaseException:
        atomic_write(TARGET, original, metadata)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print(json.dumps({'status': 'reloaded', 'target': str(TARGET), 'backup': str(backup), 'beforeSha256': before, 'afterSha256': hashlib.sha256(updated).hexdigest()}))


if __name__ == '__main__':
    main()
