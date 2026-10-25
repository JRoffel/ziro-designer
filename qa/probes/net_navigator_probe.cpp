// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
//
// What wxWidgets draws for SCH_EDIT_FRAME's Net Navigator tree
// (createHighlightedNetNavigator, eeschema/sch_edit_frame.cpp:2540):
//
//     m_netNavigator = new wxGenericTreeCtrl( panel, wxID_ANY, wxPoint( 0, 0 ),
//                                             FromDIP( wxSize( 160, 250 ) ),
//                                             wxTR_DEFAULT_STYLE | wxNO_BORDER );
//
// filled the way RefreshNetNavigator fills it while a net is highlighted: the net as the
// root, one sheet row, the items under it, one of them selected - and, separately, the
// all-nets shape ("Nets" root, net rows, sheet rows). No images.
//
// It is wxGenericTreeCtrl's PaintLevel/PaintItem arithmetic (src/generic/treectlg.cpp)
// realised with this machine's font and theme: row pitch, button position and shape,
// text x per level, the selection band and the colours, read back off the display.
//
//   g++ -Wno-deprecated-declarations -o net_navigator_probe net_navigator_probe.cpp \
//       $(wx-config --cxxflags --libs core,base)
//   env -i HOME=$HOME DISPLAY=:0 XAUTHORITY=$XAUTHORITY GDK_BACKEND=x11 PATH=/usr/bin:/bin \
//       ./net_navigator_probe
#include <wx/wx.h>
#include <wx/treectrl.h>
#include <wx/generic/treectlg.h>
#include <wx/dcclient.h>
#include <wx/dcmemory.h>
#include <wx/dcscreen.h>
#include <wx/timer.h>
#include <wx/settings.h>
#include <cstdio>
#include <vector>

class Probe : public wxApp
{
public:
    bool OnInit() override
    {
        wxFrame* frame = new wxFrame( nullptr, wxID_ANY, wxS( "netnav" ), wxDefaultPosition,
                                      wxSize( 420, 320 ) );
        wxPanel* panel = new wxPanel( frame );
        wxBoxSizer* sizer = new wxBoxSizer( wxVERTICAL );
        panel->SetSizer( sizer );

        m_tree = new wxGenericTreeCtrl( panel, wxID_ANY, wxPoint( 0, 0 ),
                                        panel->FromDIP( wxSize( 160, 250 ) ),
                                        wxTR_DEFAULT_STYLE | wxNO_BORDER );
        sizer->Add( m_tree, 1, wxEXPAND | wxLEFT | wxRIGHT | wxBOTTOM, panel->FromDIP( 2 ) );

        wxTreeItemId root = m_tree->AddRoot( wxS( "Net-(P3-P1)" ) );
        wxTreeItemId sheet = m_tree->AppendItem( root, wxS( "ecc83-pp" ) );
        wxTreeItemId a = m_tree->AppendItem( sheet, wxS( "Symbol '#FLG07' pin '1' (pwr)" ) );
        wxTreeItemId b = m_tree->AppendItem( sheet, wxS( "Symbol 'C1' pin '1'" ) );
        wxTreeItemId c = m_tree->AppendItem( sheet, wxS( "Symbol 'P3' pin '1' (P1)" ) );
        wxTreeItemId d = m_tree->AppendItem( sheet, wxS( "Symbol 'U1A' pin '6' (A)" ) );
        // A second, collapsed parent under the root, so a closed button is drawn too.
        wxTreeItemId other = m_tree->AppendItem( root, wxS( "closed sheet" ) );
        m_tree->AppendItem( other, wxS( "hidden" ) );
        m_tree->Expand( root );
        m_tree->EnsureVisible( c );
        m_tree->SelectItem( c );
        m_sel = c;
        m_items = { root, sheet, a, b, c, d, other };

        frame->Show();
        m_timer.Bind( wxEVT_TIMER, [this, frame]( wxTimerEvent& ) { Dump(); frame->Close(); } );
        m_timer.StartOnce( 800 );
        return true;
    }

    void Dump()
    {
        wxYield();
        wxClientDC cdc( m_tree );
        printf( "style %#lx  wxTR_HAS_BUTTONS %d  wxTR_NO_LINES %d  wxTR_LINES_AT_ROOT %d  wxTR_FULL_ROW_HIGHLIGHT %d\n",
                m_tree->GetWindowStyleFlag(), !!( m_tree->GetWindowStyleFlag() & wxTR_HAS_BUTTONS ),
                !!( m_tree->GetWindowStyleFlag() & wxTR_NO_LINES ),
                !!( m_tree->GetWindowStyleFlag() & wxTR_LINES_AT_ROOT ),
                !!( m_tree->GetWindowStyleFlag() & wxTR_FULL_ROW_HIGHLIGHT ) );
        printf( "font %s %g pt, char height %d\n",
                (const char*) m_tree->GetFont().GetFaceName().utf8_str(),
                m_tree->GetFont().GetFractionalPointSize(), cdc.GetCharHeight() );
        printf( "GetIndent %u  GetSpacing %u  fg #%02X%02X%02X  bg #%02X%02X%02X  focus=%d\n",
                m_tree->GetIndent(), m_tree->GetSpacing(), m_tree->GetForegroundColour().Red(),
                m_tree->GetForegroundColour().Green(), m_tree->GetForegroundColour().Blue(),
                m_tree->GetBackgroundColour().Red(), m_tree->GetBackgroundColour().Green(),
                m_tree->GetBackgroundColour().Blue(), m_tree->HasFocus() );

        for( const wxTreeItemId& id : m_items )
        {
            wxRect r, t;
            m_tree->GetBoundingRect( id, r, false );
            m_tree->GetBoundingRect( id, t, true );
            printf( "item %-32s row x=%d y=%d w=%d h=%d   text x=%d y=%d w=%d h=%d\n",
                    (const char*) m_tree->GetItemText( id ).utf8_str(), r.x, r.y, r.width,
                    r.height, t.x, t.y, t.width, t.height );
        }

        wxSize  sz = m_tree->GetClientSize();
        wxPoint org = m_tree->ClientToScreen( wxPoint( 0, 0 ) );
        wxBitmap bmp( sz.x, sz.y, 24 );
        {
            wxScreenDC sdc;
            wxMemoryDC mdc( bmp );
            mdc.Blit( 0, 0, sz.x, sz.y, &sdc, org.x, org.y );
        }
        wxImage img = bmp.ConvertToImage();
        img.SaveFile( wxS( "/tmp/net_navigator_probe.png" ), wxBITMAP_TYPE_PNG );
        printf( "client %dx%d, saved /tmp/net_navigator_probe.png\n", sz.x, sz.y );

        auto px = [&]( int x, int y ) -> unsigned
        {
            return ( img.GetRed( x, y ) << 16 ) | ( img.GetGreen( x, y ) << 8 ) | img.GetBlue( x, y );
        };
        auto scanRow = [&]( const char* label, int y, int x0, int x1 )
        {
            printf( "%s y=%d x=%d..%d:", label, y, x0, x1 );
            for( int x = x0; x <= x1; ++x ) printf( " %06X", px( x, y ) );
            printf( "\n" );
        };
        auto scanCol = [&]( const char* label, int x, int y0, int y1 )
        {
            printf( "%s x=%d y=%d..%d:", label, x, y0, y1 );
            for( int y = y0; y <= y1; ++y ) printf( " %06X", px( x, y ) );
            printf( "\n" );
        };

        wxRect rr, rs, rsel, ro;
        m_tree->GetBoundingRect( m_items[0], rr, false );
        m_tree->GetBoundingRect( m_items[1], rs, false );
        m_tree->GetBoundingRect( m_sel, rsel, false );
        m_tree->GetBoundingRect( m_items[6], ro, false );

        for( int y = rr.y; y < rr.y + rr.height; ++y )
            scanRow( "root button  ", y, 0, 20 );
        for( int y = ro.y; y < ro.y + ro.height; ++y )
            scanRow( "closed button", y, 0, 36 );
        scanRow( "sheet mid    ", rs.y + rs.height / 2, 0, 40 );
        scanCol( "selected col ", rsel.x + 5, rsel.y - 2, rsel.y + rsel.height + 1 );
        scanRow( "selected top ", rsel.y + 1, rsel.x - 3, rsel.x + 6 );
        scanRow( "selected end ", rsel.y + rsel.height / 2, rsel.x + rsel.width - 5,
                 rsel.x + rsel.width + 4 );
    }

    wxGenericTreeCtrl*        m_tree = nullptr;
    wxTimer                   m_timer;
    wxTreeItemId              m_sel;
    std::vector<wxTreeItemId> m_items;
};

wxIMPLEMENT_APP( Probe );
