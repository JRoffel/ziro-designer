// wxListCtrl::FindItem( -1, text ): the match EDA_LIST_DIALOG::initDialog preselects with.
// Measured 10-21: 'exact Power=1 lower power=1 pinned Device=-1 star=0 partial Pow=-1' -
// whole text, case ignored; a pinned library's starred row is not found by its bare name.
// Build: g++ -o finditem finditem_probe.cpp $(wx-config --cxxflags --libs core,base)
#include <wx/wx.h>
#include <wx/listctrl.h>
class App : public wxApp { public: bool OnInit() override {
  wxFrame* f = new wxFrame(nullptr, wxID_ANY, "p");
  wxListCtrl* l = new wxListCtrl(f, wxID_ANY, wxDefaultPosition, wxDefaultSize, wxLC_REPORT|wxLC_SINGLE_SEL);
  l->InsertColumn(0, "Library");
  l->InsertItem(0, wxString::FromUTF8("\xe2\x98\x86 Device"));
  l->InsertItem(1, "Power");
  printf("exact Power=%ld lower power=%ld pinned Device=%ld star=%ld partial Pow=%ld\n",
    l->FindItem(-1, "Power"), l->FindItem(-1, "power"), l->FindItem(-1, "Device"),
    l->FindItem(-1, wxString::FromUTF8("\xe2\x98\x86 Device")), l->FindItem(-1, "Pow"));
  return false; } };
wxIMPLEMENT_APP(App);
