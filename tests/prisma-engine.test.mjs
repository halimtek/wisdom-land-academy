import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { binaryTargetFromOsRelease, resolveQueryEngineLibrary } from '../src/lib/prisma-engine.mjs';

const AMAZON_LINUX_2023 = 'NAME="Amazon Linux"\nVERSION="2023"\nID="amzn"\nID_LIKE="fedora"\nVERSION_ID="2023"\n';
const UBUNTU_2404 = 'PRETTY_NAME="Ubuntu 24.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n';
const DEBIAN_12 = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
const ALPINE = 'NAME="Alpine Linux"\nID=alpine\n';
const DIR = '/var/task/src/generated/prisma';
const RHEL = `${DIR}/libquery_engine-rhel-openssl-3.0.x.so.node`;
const DEB = `${DIR}/libquery_engine-debian-openssl-3.0.x.so.node`;

function io({ env = {}, platform = 'linux', osRelease = AMAZON_LINUX_2023, files = [RHEL] } = {}) {
  return {
    env, platform, cwd: '/var/task', join: path.posix.join,
    readOsRelease: () => osRelease,
    exists: (p) => files.includes(p),
    list: (dir) => files.filter((f) => path.posix.dirname(f) === dir).map((f) => path.posix.basename(f)),
  };
}

test('binary target from /etc/os-release', () => {
  assert.equal(binaryTargetFromOsRelease(AMAZON_LINUX_2023), 'rhel-openssl-3.0.x');
  assert.equal(binaryTargetFromOsRelease(UBUNTU_2404), 'debian-openssl-3.0.x');
  assert.equal(binaryTargetFromOsRelease(DEBIAN_12), 'debian-openssl-3.0.x');
  assert.equal(binaryTargetFromOsRelease('ID="rhel"\nID_LIKE="fedora"'), 'rhel-openssl-3.0.x');
  assert.equal(binaryTargetFromOsRelease(ALPINE), null);
});

test('Vercel (Amazon Linux 2023): points Prisma at the traced rhel engine under cwd', () => {
  assert.equal(resolveQueryEngineLibrary(io()), RHEL);
});

test('picks the engine matching the distro when both engines are present', () => {
  assert.equal(resolveQueryEngineLibrary(io({ files: [RHEL, DEB] })), RHEL);
  assert.equal(resolveQueryEngineLibrary(io({ osRelease: UBUNTU_2404, files: [RHEL, DEB] })), DEB);
});

test('never overrides an explicit PRISMA_QUERY_ENGINE_LIBRARY', () => {
  assert.equal(resolveQueryEngineLibrary(io({ env: { PRISMA_QUERY_ENGINE_LIBRARY: '/custom/engine.so.node' } })), null);
});

test('leaves Prisma alone when the matching engine is missing, on other OSes, or unknown distros', () => {
  assert.equal(resolveQueryEngineLibrary(io({ files: [DEB] })), null, 'never selects the wrong platform engine');
  assert.equal(resolveQueryEngineLibrary(io({ platform: 'darwin' })), null);
  assert.equal(resolveQueryEngineLibrary(io({ osRelease: ALPINE, files: [RHEL] })), null);
});

test('without /etc/os-release, uses the engine only if it is the single one present', () => {
  assert.equal(resolveQueryEngineLibrary(io({ osRelease: null, files: [RHEL] })), RHEL);
  assert.equal(resolveQueryEngineLibrary(io({ osRelease: null, files: [RHEL, DEB] })), null);
  assert.equal(resolveQueryEngineLibrary(io({ osRelease: null, files: [] })), null);
});
