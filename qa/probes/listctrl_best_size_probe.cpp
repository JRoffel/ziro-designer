// The best size wx gives a report-mode wxListCtrl (DIALOG_DRC_BASE's m_ignoredList, built at
// wxDefaultSize, Add( m_ignoredList, 1, wxEXPAND|..., 5 )) empty, with 13 rows and with 300:
// whether its rows can grow the dialog it sits in.
//
//   g++ -Wno-deprecated-declarations -o listctrl_best_size_probe listctrl_best_size_probe.cpp \
//       $(wx-config --cxxflags --libs core,base)
//   env -i HOME=$HOME DISPLAY=:0 XAUTHORITY=$XAUTHORITY GDK_BACKEND=x11 PATH=/usr/bin:/bin \
//       ./listctrl_best_size_probe
//
// On this machine: empty, 13 rows and 300 rows all report 400 x 180; the dialog fits to 410 x 190.
#include <wx/wx.h>
#include <wx/listctrl.h>
class App : public wxApp {
public:
  bool OnInit() override {
    wxDialog* dlg = new wxDialog( nullptr, wxID_ANY, "probe", wxDefaultPosition, wxDefaultSize, wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER );
    wxBoxSizer* sizer = new wxBoxSizer( wxVERTICAL );
    wxListCtrl* list = new wxListCtrl( dlg, wxID_ANY, wxDefaultPosition, wxDefaultSize, wxLC_NO_HEADER|wxLC_REPORT|wxLC_SINGLE_SEL );
    sizer->Add( list, 1, wxEXPAND|wxALL, 5 );
    dlg->SetSizer( sizer );
    list->AppendColumn( wxEmptyString );
    list->AppendColumn( wxEmptyString );
    auto report = [&]( const char* what ) {
      list->InvalidateBestSize();
      printf( "%-8s best %d x %d\n", what, list->GetBestSize().x, list->GetBestSize().y );
    };
    report( "empty" );
    for( int i = 0; i < 13; i++ ) { long r = list->InsertItem( i, wxString::Format( "Warning %d: some rule", i ) ); list->SetItem( r, 1, "Ignored" ); }
    report( "13 rows" );
    for( int i = 13; i < 300; i++ ) { long r = list->InsertItem( i, wxString::Format( "Warning %d: some rule", i ) ); list->SetItem( r, 1, "Ignored" ); }
    report( "300 rows" );
    dlg->Fit();
    printf( "dialog fit with 300 rows: %d x %d\n", dlg->GetSize().x, dlg->GetSize().y );
    exit( 0 );
  }
};
wxIMPLEMENT_APP( App );
