"""
wxGauge on GTK is a GtkProgressBar (DIALOG_DRC's m_gauge, and every WX_PROGRESS_REPORTER).
Renders one offscreen at 0.5 and 0.0, 390 wide like DRC's, and saves the pixbufs - the trough,
the fill and their edges read off GTK itself, not off Yaru's stylesheet (which said the trough
was #222222 inside a #181818 border; GTK draws #4B4B4B with no border).

  env -i DISPLAY=:0 GDK_BACKEND=x11 HOME=$HOME PATH=/usr/bin:/bin XDG_RUNTIME_DIR=/run/user/1000 \
      XAUTHORITY=... /usr/bin/python3 -I progress_bar_probe.py

Measured 2026-10-16, Yaru-dark: the bar is 390 x 4. At 0.5, rows 0-3:
  trough       rgb(75,75,75) #4B4B4B, corners anti-aliased (60 / 59): rounded, no edge colour
  fill         rgb(233,84,32) #E95420 inside a 1px rgb(235,102,55) #EB6637 edge, all 4 rows
"""
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib
s = Gtk.Settings.get_default()
print('theme', s.get_property('gtk-theme-name'), 'dark', s.get_property('gtk-application-prefer-dark-theme'))
res = {}
def shot(frac, name):
    win = Gtk.OffscreenWindow()
    box = Gtk.Box(); box.set_border_width(5)
    bar = Gtk.ProgressBar(); bar.set_fraction(frac); bar.set_size_request(390, -1)
    box.pack_start(bar, True, True, 0); win.add(box); win.show_all()
    while Gtk.events_pending(): Gtk.main_iteration()
    pb = win.get_pixbuf(); a = bar.get_allocation()
    print(name, 'bar alloc', a.x, a.y, a.width, a.height, 'win', pb.get_width(), pb.get_height())
    pb.savev('%s.png' % name, 'png', [], [])
shot(0.5, 'p50'); shot(0.0, 'p0')
