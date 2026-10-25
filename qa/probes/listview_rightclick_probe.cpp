// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
//
// Does a right-click select the row under it in CvPcb's footprint list?
//
// FOOTPRINTS_LISTBOX is an ITEMS_LISTBOX_BASE, a wxListView (wxLC_REPORT | wxLC_SINGLE_SEL |
// wxLC_NO_HEADER | wxLC_VIRTUAL), and CVPCB_MAINFRAME::setupEventHandlers binds
//
//     m_footprintListBox->Bind( wxEVT_RIGHT_DOWN, [this]( wxMouseEvent& ) { PopupMenu( ... ); } );
//
// without Skip(). On GTK the list is wxGenericListCtrl, whose wxListMainWindow hands mouse
// events to the control first; whether the row then gets selected is the question, and only
// wx can answer it. This builds the same control, binds the same handler, right-clicks row 3
// with wxUIActionSimulator, and reports the handler call and the selection - once as KiCad
// binds it and once with Skip(), as a control.
//
//   g++ -Wno-deprecated-declarations -o listview_rightclick_probe listview_rightclick_probe.cpp \
//       $(wx-config --cxxflags --libs core,base)
//   env -i HOME=$HOME DISPLAY=:0 XAUTHORITY=$XAUTHORITY GDK_BACKEND=x11 PATH=/usr/bin:/bin \
//       ./listview_rightclick_probe
#include <wx/wx.h>
#include <wx/listctrl.h>
#include <wx/uiaction.h>
#include <wx/timer.h>
#include <cstdio>

class LIST : public wxListView
{
public:
    LIST( wxWindow* aParent ) :
            wxListView( aParent, wxID_ANY, wxDefaultPosition, wxSize( 300, 300 ),
                        wxLC_REPORT | wxLC_SINGLE_SEL | wxLC_NO_HEADER | wxLC_VIRTUAL )
    {
        AppendColumn( wxEmptyString, wxLIST_FORMAT_LEFT, 280 );
        SetItemCount( 20 );
    }

    wxString OnGetItemText( long aItem, long ) const override
    {
        return wxString::Format( "row %ld", aItem );
    }
};

class Probe : public wxApp
{
public:
    bool OnInit() override
    {
        m_frame = new wxFrame( nullptr, wxID_ANY, wxS( "rightclick" ), wxPoint( 50, 50 ),
                               wxSize( 340, 360 ) );
        m_list = new LIST( m_frame );
        m_list->Bind( wxEVT_RIGHT_DOWN,
                      [this]( wxMouseEvent& aEvent )
                      {
                          m_calls++;

                          if( m_skip )
                              aEvent.Skip();
                      } );
        m_frame->Show();
        m_frame->Raise();
        m_timer.Bind( wxEVT_TIMER, [this]( wxTimerEvent& ) { Step(); } );
        m_timer.Start( 500 );
        return true;
    }

    void Step()
    {
        wxRect rect;
        m_list->GetItemRect( 3, rect );
        wxPoint at = m_list->ClientToScreen( rect.GetPosition() + wxPoint( 20, rect.height / 2 ) );
        wxUIActionSimulator sim;

        switch( m_step++ )
        {
        case 0:
            m_list->Select( m_list->GetFirstSelected(), false );
            m_skip = false;
            sim.MouseMove( at );
            break;
        case 1:
            sim.MouseClick( wxMOUSE_BTN_RIGHT );
            break;
        case 2:
            printf( "as KiCad binds it (no Skip): handler called %d, selected row %ld\n", m_calls,
                    m_list->GetFirstSelected() );
            m_calls = 0;
            m_skip = true;
            sim.MouseMove( at );
            break;
        case 3:
            sim.MouseClick( wxMOUSE_BTN_RIGHT );
            break;
        case 4:
            printf( "control (Skip): handler called %d, selected row %ld\n", m_calls,
                    m_list->GetFirstSelected() );
            m_timer.Stop();
            m_frame->Close();
            break;
        }
    }

    wxFrame*  m_frame = nullptr;
    LIST*     m_list = nullptr;
    wxTimer   m_timer;
    int       m_step = 0;
    int       m_calls = 0;
    bool      m_skip = false;
};

wxIMPLEMENT_APP( Probe );
