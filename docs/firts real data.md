PS C:\HAITHAM_OS\07_WEB_DEV\Priora Scan\desktop-agent> python tools/elm_wifi_probe.py
Connecting to 192.168.0.10:35000 timeout=15.0s
2026-06-14 00:57:36,014 INFO src.obd.connection.wifi: WiFi connection established to 192.168.0.10:35000

>>> ATZ
2026-06-14 00:57:36,015 DEBUG src.obd.connection.wifi: WiFi TX b'ATZ\r'
2026-06-14 00:57:37,006 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r\n\r\nELM327 v1.5\r\n\r\n>'
2026-06-14 00:57:37,006 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.985s prompt_found=True bytes=b'\r\n\r\nELM327 v1.5\r\n\r\n>'
elapsed=0.985s prompt_found=True
raw=b'\r\n\r\nELM327 v1.5\r\n\r\n>'


ELM327 v1.5

>

>>> ATI
2026-06-14 00:57:37,006 DEBUG src.obd.connection.wifi: WiFi TX b'ATI\r'
2026-06-14 00:57:37,148 DEBUG src.obd.connection.wifi: WiFi RX chunk b'ATI\r\nELM327 v1.5\r\n\r\n>'
2026-06-14 00:57:37,148 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.140s prompt_found=True bytes=b'ATI\r\nELM327 v1.5\r\n\r\n>'
elapsed=0.140s prompt_found=True
raw=b'ATI\r\nELM327 v1.5\r\n\r\n>'
ATI
ELM327 v1.5

>

>>> ATE0
2026-06-14 00:57:37,148 DEBUG src.obd.connection.wifi: WiFi TX b'ATE0\r'
2026-06-14 00:57:37,339 DEBUG src.obd.connection.wifi: WiFi RX chunk b'ATE0\r\nOK\r\n\r\n>'
2026-06-14 00:57:37,339 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.203s prompt_found=True bytes=b'ATE0\r\nOK\r\n\r\n>'
elapsed=0.203s prompt_found=True
raw=b'ATE0\r\nOK\r\n\r\n>'
ATE0
OK

>

>>> ATL0
2026-06-14 00:57:37,339 DEBUG src.obd.connection.wifi: WiFi TX b'ATL0\r'
2026-06-14 00:57:37,439 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 00:57:37,439 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.094s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.094s prompt_found=True
raw=b'OK\r\r>'
>K

>>> ATS0
2026-06-14 00:57:37,460 DEBUG src.obd.connection.wifi: WiFi TX b'ATS0\r'
2026-06-14 00:57:37,623 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 00:57:37,623 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.172s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.188s prompt_found=True
raw=b'OK\r\r>'
>K

>>> ATH0
2026-06-14 00:57:37,625 DEBUG src.obd.connection.wifi: WiFi TX b'ATH0\r'
2026-06-14 00:57:37,709 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 00:57:37,711 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.093s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.093s prompt_found=True
raw=b'OK\r\r>'
>K

>>> ATSP0
2026-06-14 00:57:37,719 DEBUG src.obd.connection.wifi: WiFi TX b'ATSP0\r'
2026-06-14 00:57:37,839 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 00:57:37,839 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.125s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.125s prompt_found=True
raw=b'OK\r\r>'
>K

>>> 0100
2026-06-14 00:57:37,839 DEBUG src.obd.connection.wifi: WiFi TX b'0100\r'
2026-06-14 00:57:37,986 DEBUG src.obd.connection.wifi: WiFi RX chunk b'SEARCHING...\r4100BE1FB813\r'
2026-06-14 00:57:38,184 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 00:57:38,184 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.344s prompt_found=True bytes=b'SEARCHING...\r4100BE1FB813\r\r>'
elapsed=0.344s prompt_found=True
raw=b'SEARCHING...\r4100BE1FB813\r\r>'
>100BE1FB813

>>> 0902
2026-06-14 00:57:38,195 DEBUG src.obd.connection.wifi: WiFi TX b'0902\r'
2026-06-14 00:57:38,339 DEBUG src.obd.connection.wifi: WiFi RX chunk b'014\r0:490201FFFFFF\r1:FFFFFFFFFFFFFF\r2:FFFFFFFFFFFFFF\r'
2026-06-14 00:57:38,568 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 00:57:38,568 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.359s prompt_found=True bytes=b'014\r0:490201FFFFFF\r1:FFFFFFFFFFFFFF\r2:FFFFFFFFFFFFFF\r\r>'
elapsed=0.359s prompt_found=True
raw=b'014\r0:490201FFFFFF\r1:FFFFFFFFFFFFFF\r2:FFFFFFFFFFFFFF\r\r>'
>:FFFFFFFFFFFFFF
2026-06-14 00:57:38,568 INFO src.obd.connection.wifi: WiFi connection closed
PS C:\HAITHAM_OS\07_WEB_DEV\Priora Scan\desktop-agent> python tools/elm_wifi_probe.py
Connecting to 192.168.0.10:35000 timeout=15.0s
2026-06-14 01:03:50,356 INFO src.obd.connection.wifi: WiFi connection established to 192.168.0.10:35000

>>> ATZ (Reset)
2026-06-14 01:03:50,356 DEBUG src.obd.connection.wifi: WiFi TX b'ATZ\r'
2026-06-14 01:03:51,346 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r\n\r\nELM327 v1.5\r\n\r\n>'
2026-06-14 01:03:51,346 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.984s prompt_found=True bytes=b'\r\n\r\nELM327 v1.5\r\n\r\n>'
elapsed=0.984s prompt_found=True
raw=b'\r\n\r\nELM327 v1.5\r\n\r\n>'


ELM327 v1.5

>

>>> ATI (Adapter ID)
2026-06-14 01:03:51,346 DEBUG src.obd.connection.wifi: WiFi TX b'ATI\r'
2026-06-14 01:03:51,496 DEBUG src.obd.connection.wifi: WiFi RX chunk b'ATI\r\nELM327 v1.5\r\n\r\n>'
2026-06-14 01:03:51,496 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.157s prompt_found=True bytes=b'ATI\r\nELM327 v1.5\r\n\r\n>'
elapsed=0.157s prompt_found=True
raw=b'ATI\r\nELM327 v1.5\r\n\r\n>'
ATI
ELM327 v1.5

>

>>> ATE0 (Echo Off)
2026-06-14 01:03:51,496 DEBUG src.obd.connection.wifi: WiFi TX b'ATE0\r'
2026-06-14 01:03:51,637 DEBUG src.obd.connection.wifi: WiFi RX chunk b'ATE0\r\nOK\r\n\r\n>'
2026-06-14 01:03:51,637 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.140s prompt_found=True bytes=b'ATE0\r\nOK\r\n\r\n>'
elapsed=0.140s prompt_found=True
raw=b'ATE0\r\nOK\r\n\r\n>'
ATE0
OK

>

>>> ATL0 (Linefeeds Off)
2026-06-14 01:03:51,637 DEBUG src.obd.connection.wifi: WiFi TX b'ATL0\r'
2026-06-14 01:03:51,853 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 01:03:51,853 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.219s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.219s prompt_found=True
raw=b'OK\r\r>'
>K

>>> ATS0 (Spaces Off)
2026-06-14 01:03:51,853 DEBUG src.obd.connection.wifi: WiFi TX b'ATS0\r'
2026-06-14 01:03:52,023 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 01:03:52,023 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.156s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.156s prompt_found=True
raw=b'OK\r\r>'
>K

>>> ATH0 (Headers Off)
2026-06-14 01:03:52,023 DEBUG src.obd.connection.wifi: WiFi TX b'ATH0\r'
2026-06-14 01:03:52,141 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 01:03:52,141 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.109s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.125s prompt_found=True
raw=b'OK\r\r>'
>K

>>> ATSP0 (Auto Protocol)
2026-06-14 01:03:52,141 DEBUG src.obd.connection.wifi: WiFi TX b'ATSP0\r'
2026-06-14 01:03:52,312 DEBUG src.obd.connection.wifi: WiFi RX chunk b'OK\r\r>'
2026-06-14 01:03:52,312 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.172s prompt_found=True bytes=b'OK\r\r>'
elapsed=0.172s prompt_found=True
raw=b'OK\r\r>'
>K

>>> 0100 (Supported PIDs 01-20)
2026-06-14 01:03:52,314 DEBUG src.obd.connection.wifi: WiFi TX b'0100\r'
2026-06-14 01:03:52,539 DEBUG src.obd.connection.wifi: WiFi RX chunk b'SEARCHING...\r4100BE1FB813\r'
2026-06-14 01:03:52,664 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 01:03:52,664 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.344s prompt_found=True bytes=b'SEARCHING...\r4100BE1FB813\r\r>'
elapsed=0.344s prompt_found=True
raw=b'SEARCHING...\r4100BE1FB813\r\r>'
>100BE1FB813

>>> 010C (Engine RPM)
2026-06-14 01:03:52,667 DEBUG src.obd.connection.wifi: WiFi TX b'010C\r'
2026-06-14 01:03:52,796 DEBUG src.obd.connection.wifi: WiFi RX chunk b'410C0E10\r'
2026-06-14 01:03:53,056 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 01:03:53,056 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.391s prompt_found=True bytes=b'410C0E10\r\r>'
elapsed=0.391s prompt_found=True
raw=b'410C0E10\r\r>'
decoded=900 rpm
>10C0E10

>>> 010D (Vehicle Speed)
2026-06-14 01:03:53,059 DEBUG src.obd.connection.wifi: WiFi TX b'010D\r'
2026-06-14 01:03:53,155 DEBUG src.obd.connection.wifi: WiFi RX chunk b'410D00\r'
2026-06-14 01:03:53,359 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 01:03:53,359 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.297s prompt_found=True bytes=b'410D00\r\r>'
elapsed=0.297s prompt_found=True
raw=b'410D00\r\r>'
decoded=0 km/h
>10D00

>>> 0105 (Coolant Temperature)
2026-06-14 01:03:53,362 DEBUG src.obd.connection.wifi: WiFi TX b'0105\r'
2026-06-14 01:03:53,570 DEBUG src.obd.connection.wifi: WiFi RX chunk b'41057E\r'
2026-06-14 01:03:53,697 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 01:03:53,699 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.344s prompt_found=True bytes=b'41057E\r\r>'
elapsed=0.344s prompt_found=True
raw=b'41057E\r\r>'
decoded=86 °C
>1057E

>>> 0104 (Engine Load)
2026-06-14 01:03:53,701 DEBUG src.obd.connection.wifi: WiFi TX b'0104\r'
2026-06-14 01:03:53,877 DEBUG src.obd.connection.wifi: WiFi RX chunk b'410476\r'
2026-06-14 01:03:54,082 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 01:03:54,082 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.375s prompt_found=True bytes=b'410476\r\r>'
elapsed=0.375s prompt_found=True
raw=b'410476\r\r>'
decoded=46.3 %
>10476

>>> 0142 (Control Module Voltage)
2026-06-14 01:03:54,082 DEBUG src.obd.connection.wifi: WiFi TX b'0142\r'
2026-06-14 01:03:54,172 DEBUG src.obd.connection.wifi: WiFi RX chunk b'41423469\r'
2026-06-14 01:03:54,304 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 01:03:54,304 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.218s prompt_found=True bytes=b'41423469\r\r>'
elapsed=0.218s prompt_found=True
raw=b'41423469\r\r>'
decoded=13.417 V
>1423469

>>> 012F (Fuel Level)
2026-06-14 01:03:54,304 DEBUG src.obd.connection.wifi: WiFi TX b'012F\r'
2026-06-14 01:03:54,630 DEBUG src.obd.connection.wifi: WiFi RX chunk b'NO DATA\r\r>'
2026-06-14 01:03:54,630 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.329s prompt_found=True bytes=b'NO DATA\r\r>'
elapsed=0.329s prompt_found=True
raw=b'NO DATA\r\r>'
decoded=NO DATA
>O DATA

>>> 0902 (VIN)
2026-06-14 01:03:54,630 DEBUG src.obd.connection.wifi: WiFi TX b'0902\r'
2026-06-14 01:03:54,792 DEBUG src.obd.connection.wifi: WiFi RX chunk b'014\r0:490201FFFFFF\r1:FFFFFFFFFFFFFF\r2:FFFFFFFFFFFFFF\r'
2026-06-14 01:03:54,902 DEBUG src.obd.connection.wifi: WiFi RX chunk b'\r>'
2026-06-14 01:03:54,902 DEBUG src.obd.connection.wifi: WiFi RX complete elapsed=0.281s prompt_found=True bytes=b'014\r0:490201FFFFFF\r1:FFFFFFFFFFFFFF\r2:FFFFFFFFFFFFFF\r\r>'
elapsed=0.281s prompt_found=True
raw=b'014\r0:490201FFFFFF\r1:FFFFFFFFFFFFFF\r2:FFFFFFFFFFFFFF\r\r>'
>:FFFFFFFFFFFFFF
2026-06-14 01:03:54,902 INFO src.obd.connection.wifi: WiFi connection closed
PS C:\HAITHAM_OS\07_WEB_DEV\Priora Scan\desktop-agent> 





















