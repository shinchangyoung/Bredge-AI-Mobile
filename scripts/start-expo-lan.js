const { spawn } = require('child_process');
const os = require('os');

const proxyPort = process.env.WORKSPACE_PROXY_PORT || '3000';
const explicitHost = process.env.WORKSPACE_PROXY_HOST;

function isTailscaleAddress(address) {
  const parts = address.split('.').map((part) => Number(part));
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function isPrivateLanAddress(address) {
  return (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

function getLanAddress() {
  if (explicitHost) {
    return explicitHost;
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const networkAddress of addresses || []) {
      if (networkAddress.family !== 'IPv4' || networkAddress.internal) {
        continue;
      }

      candidates.push({
        address: networkAddress.address,
        isPrivate: isPrivateLanAddress(networkAddress.address),
        isTailscale: isTailscaleAddress(networkAddress.address),
        name,
      });
    }
  }

  const lanCandidate = candidates.find((candidate) => candidate.isPrivate && !candidate.isTailscale);
  const fallbackCandidate = candidates.find((candidate) => !candidate.isTailscale) ?? candidates[0];

  if (!lanCandidate && !fallbackCandidate) {
    throw new Error('맥북의 LAN IP를 찾지 못했습니다. 와이파이/핫스팟 연결을 확인해 주세요.');
  }

  return (lanCandidate ?? fallbackCandidate).address;
}

const host = getLanAddress();
const apiBaseUrl = `http://${host}:${proxyPort}`;
const expoArgs = ['expo', 'start', '--clear', ...process.argv.slice(2)];

console.log(`Using EXPO_PUBLIC_WORKSPACE_API_BASE_URL=${apiBaseUrl}`);
console.log(`아이폰 Safari 확인 주소: ${apiBaseUrl}/workspace/tree`);

const child = spawn('npx', expoArgs, {
  env: {
    ...process.env,
    EXPO_PUBLIC_WORKSPACE_API_BASE_URL: apiBaseUrl,
  },
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
