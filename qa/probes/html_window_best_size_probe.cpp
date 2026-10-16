// The best size wx gives a wxHtmlWindow nobody sized (WX_HTML_REPORT_BOX is one, built at
// wxDefaultSize in every _base.cpp), empty and after 300 long report lines: whether its
// content can grow the dialog it sits in; and whether a word too long for it wraps or
// scrolls across.
//
//   g++ -Wno-deprecated-declarations -o html_window_best_size_probe \
//       html_window_best_size_probe.cpp $(wx-config --cxxflags --libs html,core,base)
#include <wx/wx.h>
#include <wx/html/htmlwin.h>

class App : public wxApp
{
public:
    bool OnInit() override
    {
        wxDialog* dlg = new wxDialog( nullptr, wxID_ANY, "probe", wxDefaultPosition, wxDefaultSize,
                                      wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER );
        wxBoxSizer* sizer = new wxBoxSizer( wxVERTICAL );
        wxHtmlWindow* html = new wxHtmlWindow( dlg, wxID_ANY, wxDefaultPosition, wxDefaultSize,
                                               wxHW_SCROLLBAR_AUTO );
        sizer->Add( html, 1, wxEXPAND | wxALL, 5 );
        dlg->SetSizer( sizer );

        printf( "empty  best %d x %d\n", html->GetBestSize().x, html->GetBestSize().y );

        wxString page;

        for( int i = 0; i < 300; i++ )
            page << "Processing symbol 'U" << i
                 << ":Button_Switch_SMD:SW_DIP_SPSTx08_Slide_6.7x21.88mm_W6.73mm_P2.54mm'.<br>";

        html->SetPage( page );
        printf( "filled best %d x %d\n", html->GetBestSize().x, html->GetBestSize().y );
        sizer->Fit( dlg );
        printf( "dialog Fit  %d x %d\n", dlg->GetSize().x, dlg->GetSize().y );

        // A long footprint id has no space to wrap at: does the window break the word, or
        // scroll across? Wrapped prose stays inside the client width either way.
        dlg->SetSize( 400, 300 );
        dlg->Layout();
        html->SetPage( "Add U2 (footprint 'Button_Switch_SMD:SW_DIP_SPSTx08_Slide_6.7x21.88mm_"
                       "W6.73mm_P2.54mm_LowProfile_JPin').<br>"
                       "short words short words short words short words short words short words "
                       "short words short words short words short words short words" );
        int cw, ch, vw, vh;
        html->GetClientSize( &cw, &ch );
        html->GetVirtualSize( &vw, &vh );
        printf( "long id: client %d x %d, virtual %d x %d\n", cw, ch, vw, vh );
        return false;
    }
};

wxIMPLEMENT_APP( App );
