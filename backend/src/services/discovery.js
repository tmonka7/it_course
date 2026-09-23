/**
 * Finds IP cameras on the local network:
 *   1. ONVIF WS-Discovery: a UDP multicast Probe that ONVIF cameras answer with their name/model.
 *   2. RTSP scan: tries TCP port 554 on every host of the local /24 subnet(s) and confirms with RTSP OPTIONS.
 * Note: when the API runs inside Docker, multicast and LAN scans only work with host networking.
 */
const crypto = require('crypto');
const dgram = require('dgram');
const net = require('net');
const os = require('os');

const WS_DISCOVERY = { address: '239.255.255.250', port: 3702 };

// Main-stream RTSP paths of common brands, used to pre-fill the stream URL.
const RTSP_PATHS = [
  [/hikvision|hikv|ds-2cd|ds-2de/i, 'Hikvision', '/Streaming/Channels/101'],
  [/dahua|ipc-h|dh-/i, 'Dahua', '/cam/realmonitor?channel=1&subtype=0'],
  [/amcrest/i, 'Amcrest', '/cam/realmonitor?channel=1&subtype=0'],
  [/axis/i, 'Axis', '/axis-media/media.amp'],
  [/uniview|unv|ipc2/i, 'Uniview', '/media/video1'],
  [/reolink/i, 'Reolink', '/h264Preview_01_main'],
  [/hanwha|wisenet|samsung/i, 'Hanwha', '/profile2/media.smp'],
  [/tapo|tp-link|vigi/i, 'TP-Link', '/stream1'],
  [/bosch/i, 'Bosch', '/'],
];

function guessBrand(...hints) {
  const text = hints.filter(Boolean).join(' ');
  const hit = RTSP_PATHS.find(([re]) => re.test(text));
  return hit ? { manufacturer: hit[1], path: hit[2] } : { manufacturer: undefined, path: '/' };
}

function probeMessage() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
<e:Header><w:MessageID>uuid:${crypto.randomUUID()}</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>
<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
</e:Envelope>`;
}

const tagText = (xml, tag) => xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([^<]*)</(?:[\\w-]+:)?${tag}>`))?.[1]?.trim();

function parseProbeMatch(xml, fromIp) {
  const xaddrs = (tagText(xml, 'XAddrs') || '').split(/\s+/).filter(Boolean);
  const scopes = (tagText(xml, 'Scopes') || '').split(/\s+/).filter(Boolean);
  const scope = (key) => {
    const s = scopes.find((x) => x.toLowerCase().includes(`onvif.org/${key}/`));
    return s ? decodeURIComponent(s.slice(s.toLowerCase().indexOf(`/${key}/`) + key.length + 2)).replace(/_/g, ' ') : undefined;
  };
  // Prefer the device address from XAddrs (the UDP source can be a NAT/bridge address).
  let ip = fromIp;
  for (const x of xaddrs) {
    try {
      const host = new URL(x).hostname;
      if (net.isIPv4(host)) {
        ip = host;
        break;
      }
    } catch {
      /* ignore malformed XAddr */
    }
  }
  return { ip, onvifUrl: xaddrs[0], name: scope('name'), model: scope('hardware'), location: scope('location') };
}

/** ONVIF WS-Discovery on every IPv4 interface. */
function onvifDiscover(timeoutMs = 3000) {
  const addresses = localIPv4().map((i) => i.address);
  const found = new Map();
  const message = Buffer.from(probeMessage());

  return new Promise((resolve) => {
    const sockets = addresses.map((address) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      socket.on('error', () => socket.close());
      socket.on('message', (buf, rinfo) => {
        const xml = buf.toString();
        if (!/ProbeMatch/i.test(xml)) return;
        const device = parseProbeMatch(xml, rinfo.address);
        found.set(device.ip, { ...found.get(device.ip), ...device });
      });
      socket.bind(0, address, () => {
        try {
          socket.setMulticastInterface(address);
        } catch {
          /* older platforms: default interface */
        }
        socket.send(message, WS_DISCOVERY.port, WS_DISCOVERY.address);
        // Cameras sometimes drop the first multicast packet; send a second probe shortly after.
        setTimeout(() => socket.send(message, WS_DISCOVERY.port, WS_DISCOVERY.address, () => {}), 400);
      });
      return socket;
    });
    setTimeout(() => {
      sockets.forEach((s) => {
        try {
          s.close();
        } catch {
          /* already closed */
        }
      });
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

function localIPv4() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'));
}

const ipToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

/** Hosts of a CIDR (prefix /22 or narrower, so a scan never exceeds ~1000 hosts). */
function hostsOf(cidr) {
  const m = String(cidr).trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m || !net.isIPv4(m[1])) throw Object.assign(new Error('Subnet must look like 192.168.1.0/24'), { status: 400 });
  const prefix = Number(m[2]);
  if (prefix < 22 || prefix > 30) throw Object.assign(new Error('Subnet prefix must be between /22 and /30'), { status: 400 });
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipToInt(m[1]) & mask;
  const size = 2 ** (32 - prefix);
  return Array.from({ length: size - 2 }, (_, i) => intToIp(network + i + 1));
}

const defaultSubnets = () => [...new Set(localIPv4().map((i) => `${i.address.split('.').slice(0, 3).join('.')}.0/24`))];

/** Connects to host:port and sends RTSP OPTIONS; resolves the server banner or null if nothing answers. */
function rtspProbe(ip, port = 554, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: ip, port });
    let data = '';
    let open = false;
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done(open ? { ip, port, server: undefined } : null));
    socket.on('connect', () => {
      open = true;
      socket.write(`OPTIONS rtsp://${ip}:${port}/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: SIST-Discovery\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\r\n\r\n')) {
        const server = data.match(/^Server:\s*(.+)$/im)?.[1]?.trim();
        done(/^RTSP\/1\.0/.test(data) ? { ip, port, server } : null);
      }
    });
    socket.on('error', () => done(null));
  });
}

async function rtspScan(subnets, concurrency = 96) {
  const hosts = [...new Set(subnets.flatMap(hostsOf))];
  const found = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const ip = hosts[next];
      next += 1;
      const hit = await rtspProbe(ip);
      if (hit) found.push(hit);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  return found;
}

/** Runs both discovery methods and merges the results by IP address. */
async function discover({ subnet, onvif = true, rtsp = true } = {}) {
  const subnets = subnet ? [subnet] : defaultSubnets();
  if (subnet) hostsOf(subnet); // validate early
  const [onvifDevices, rtspHosts] = await Promise.all([
    onvif ? onvifDiscover() : [],
    rtsp && subnets.length ? rtspScan(subnets) : [],
  ]);

  const devices = new Map();
  onvifDevices.forEach((d) => devices.set(d.ip, { ...d, via: 'ONVIF', rtspPort: undefined }));
  rtspHosts.forEach((h) => {
    const existing = devices.get(h.ip);
    devices.set(h.ip, existing ? { ...existing, rtspPort: h.port, server: h.server } : { ip: h.ip, via: 'RTSP scan', rtspPort: h.port, server: h.server });
  });

  const list = [...devices.values()].map((d) => {
    const brand = guessBrand(d.name, d.model, d.server);
    const port = d.rtspPort || 554;
    return {
      ...d,
      manufacturer: brand.manufacturer,
      suggestedStreamUrl: `rtsp://${d.ip}${port === 554 ? '' : `:${port}`}${brand.path}`,
    };
  });
  list.sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
  return { devices: list, subnets };
}

module.exports = { discover, defaultSubnets };
