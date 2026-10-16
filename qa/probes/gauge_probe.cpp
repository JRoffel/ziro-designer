// DIALOG_DRC's gauge as GTK draws it: m_gauge = new wxGauge( m_panelMessages, wxID_ANY, 100,
// wxDefaultPosition, wxDefaultSize, wxGA_HORIZONTAL|wxGA_SMOOTH ) inside bGaugeMargins
// (wxALL|wxEXPAND, 5) - dialog_drc_base.cpp. Prints its best size (152 x 4 here) and its laid
// out size (390 x 4). The captures it saves come out black under Xwayland, where wxScreenDC
// cannot read the screen; progress_bar_probe.py renders the same GtkProgressBar offscreen
// and is where the colours come from.
//
//   g++ -Wno-deprecated-declarations -o gauge_probe gauge_probe.cpp \
//       $(wx-config --cxxflags --libs core,base)
//   GDK_BACKEND=x11 ./gauge_probe /path/to/out   (writes out_50.png and out_0.png)
#include <wx/wx.h>

class App : public wxApp
{
public:
    bool OnInit() override
    {
        m_out = argc > 1 ? wxString( argv[1] ) : wxString( "gauge" );
        m_dlg = new wxDialog( nullptr, wxID_ANY, "probe", wxPoint( 100, 100 ), wxSize( 400, 120 ) );
        wxPanel* panel = new wxPanel( m_dlg );
        wxBoxSizer* sizer = new wxBoxSizer( wxVERTICAL );
        m_gauge = new wxGauge( panel, wxID_ANY, 1000, wxDefaultPosition, wxDefaultSize,
                               wxGA_HORIZONTAL | wxGA_SMOOTH );
        sizer->Add( m_gauge, 0, wxALL | wxEXPAND, 5 );
        panel->SetSizer( sizer );
        m_gauge->SetValue( 500 );
        m_dlg->Show();

        printf( "gauge best %d x %d\n", m_gauge->GetBestSize().x, m_gauge->GetBestSize().y );

        m_timer.Bind( wxEVT_TIMER, &App::onTimer, this );
        m_timer.StartOnce( 800 );
        return true;
    }

    void capture( const wxString& aName )
    {
        wxRect   r = m_gauge->GetScreenRect();
        printf( "gauge size %d x %d\n", r.width, r.height );
        r.Inflate( 4 );
        wxScreenDC screen;
        wxBitmap   bmp( r.width, r.height );
        wxMemoryDC mem( bmp );
        mem.Blit( 0, 0, r.width, r.height, &screen, r.x, r.y );
        mem.SelectObject( wxNullBitmap );
        bmp.SaveFile( m_out + aName, wxBITMAP_TYPE_PNG );
    }

    void onTimer( wxTimerEvent& )
    {
        if( m_step == 0 )
        {
            capture( "_50.png" );
            m_gauge->SetValue( 0 );
            m_step = 1;
            m_timer.StartOnce( 500 );
        }
        else
        {
            capture( "_0.png" );
            m_dlg->Destroy();
            ExitMainLoop();
        }
    }

    wxString  m_out;
    wxDialog* m_dlg = nullptr;
    wxGauge*  m_gauge = nullptr;
    wxTimer   m_timer;
    int       m_step = 0;
};

wxIMPLEMENT_APP( App );
