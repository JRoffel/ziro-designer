// The best width wx gives a wxComboBox and a wxChoice nobody sized, on this machine's
// GTK theme - what Footprint Properties' Orientation and Side controls Fit() to
// (dialog_footprint_properties_base.cpp:140-158), beside a bare wxTextCtrl's for scale.
//
//   g++ -Wno-deprecated-declarations -o combo_best_size_probe \
//       combo_best_size_probe.cpp $(wx-config --cxxflags --libs core,base)
#include <wx/wx.h>

class App : public wxApp
{
public:
    bool OnInit() override
    {
        wxFrame* frame = new wxFrame( nullptr, wxID_ANY, "probe" );
        wxPanel* panel = new wxPanel( frame );

        wxComboBox* combo = new wxComboBox( panel, wxID_ANY, "0" );
        combo->Append( "0" );
        combo->Append( "90" );
        combo->Append( "-90" );
        combo->Append( "180" );

        wxString sides[] = { "Front", "Back" };
        wxChoice* side = new wxChoice( panel, wxID_ANY, wxDefaultPosition, wxDefaultSize, 2, sides );

        wxTextCtrl* entry = new wxTextCtrl( panel, wxID_ANY );
        frame->Show();

        printf( "wxComboBox best %d x %d\n", combo->GetBestSize().x, combo->GetBestSize().y );
        printf( "wxChoice   best %d x %d\n", side->GetBestSize().x, side->GetBestSize().y );
        printf( "wxTextCtrl best %d x %d\n", entry->GetBestSize().x, entry->GetBestSize().y );
        fflush( stdout );
        frame->Destroy();
        return true;
    }
};
wxIMPLEMENT_APP_CONSOLE( App );
