// Does a programmatic wxDataViewCtrl::Select() send wxEVT_DATAVIEW_SELECTION_CHANGED on wxGTK?
// DIALOG_DRC::SelectMarker selects a row with RC_TREE_MODEL::SelectMarker -> m_view->Select(); if the
// event fires, OnDRCItemSelected runs (focus, brighten, active layer) after a marker click too.
//
//   g++ -Wno-deprecated-declarations -o dataview_select_event_probe dataview_select_event_probe.cpp \
//       $(wx-config --cxxflags --libs core,base,adv)
//   env -i HOME=$HOME DISPLAY=:0 XAUTHORITY=$XAUTHORITY GDK_BACKEND=x11 PATH=/usr/bin:/bin \
//       ./dataview_select_event_probe
//
// On this machine: 0 events after Select(), and 0 after SelectRow() - neither is reported.
#include <wx/wx.h>
#include <wx/dataview.h>
class App : public wxApp {
public:
  bool OnInit() override {
    wxFrame* f = new wxFrame( nullptr, wxID_ANY, "probe" );
    wxDataViewListCtrl* dv = new wxDataViewListCtrl( f, wxID_ANY );
    dv->AppendTextColumn( "c" );
    for( int i = 0; i < 5; i++ ) { wxVector<wxVariant> row; row.push_back( wxString::Format( "row %d", i ) ); dv->AppendItem( row ); }
    int events = 0;
    dv->Bind( wxEVT_DATAVIEW_SELECTION_CHANGED, [&]( wxDataViewEvent& ) { events++; } );
    f->Show();
    for( int i = 0; i < 20; i++ ) wxYield();
    dv->Select( dv->RowToItem( 2 ) );
    for( int i = 0; i < 20; i++ ) wxYield();
    printf( "after Select(row 2): %d selection-changed events, selected row %d\n", events, dv->GetSelectedRow() );
    dv->SelectRow( 3 );
    for( int i = 0; i < 20; i++ ) wxYield();
    printf( "after SelectRow(3): %d events total\n", events );
    exit( 0 );
  }
};
wxIMPLEMENT_APP( App );
