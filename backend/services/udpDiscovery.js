import dgram from 'dgram';

const UDP_PORT = 41234;

/**
 * Khởi tạo UDP Auto-Discovery Server để ESP32 tự động tìm IP máy tính trong mạng LAN.
 */
export function startUdpDiscoveryServer(serverPort, getLocalIpAddressFn) {
  const udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  udpServer.on('message', (msg, rinfo) => {
    const messageStr = msg.toString().trim();
    if (messageStr === 'DISCOVER_CAR_SERVER') {
      const localIp = getLocalIpAddressFn();
      const response = JSON.stringify({
        type: 'CAR_SERVER_RESPONSE',
        ip: localIp,
        port: serverPort
      });
      console.log(`[UDP DISCOVERY] Nhận yêu cầu từ ESP32 (${rinfo.address}:${rinfo.port}) -> Phản hồi IP: ${localIp}:${serverPort}`);
      udpServer.send(response, rinfo.port, rinfo.address, (err) => {
        if (err) console.error('[UDP DISCOVERY] Lỗi gửi phản hồi UDP:', err);
      });
    }
  });

  udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`[UDP DISCOVERY] Lắng nghe yêu cầu tự động dò tìm từ ESP32 trên cổng UDP ${address.port}`);
  });

  udpServer.bind(UDP_PORT);
  return udpServer;
}
