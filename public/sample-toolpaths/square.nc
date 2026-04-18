; Simple square pocket - test G-code
G90 G21 G17 ; Absolute, mm, XY plane
G0 Z50          ; Rapid to safe height
G0 X0 Y0        ; Move to origin

; Cut square pocket
G0 X-50 Y-50    ; Move to start corner
G1 Z0 F300      ; Plunge to surface
G1 Z-10 F100    ; Cut depth 10mm

G1 X50 Y-50 F500  ; Side 1
G1 X50 Y50        ; Side 2
G1 X-50 Y50       ; Side 3
G1 X-50 Y-50      ; Side 4

G0 Z50            ; Retract
G0 X0 Y0          ; Return to origin
