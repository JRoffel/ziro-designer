// DIALOG_PLOT's two layer lists (pcbnew/dialogs/dialog_plot_base.cpp:96-99, dialog_plot.cpp:195):
// a wxCheckListBox of 22 layers and a wxRearrangeList, each in a static box sizer with
// proportion 1. Their height is wx's best size, which this asks wxGTK for: is it every row, or
// capped?
//
//   g++ -Wno-deprecated-declarations -o plot_layer_list_probe plot_layer_list_probe.cpp \
//       $(wx-config --cxxflags --libs core,base)
#include <wx/wx.h>
#include <wx/checklst.h>
#include <wx/rearrangectrl.h>
#include <cstdio>

class App : public wxApp
{
public:
    bool OnInit() override
    {
        wxDialog* dlg = new wxDialog( nullptr, wxID_ANY, "Plot" );
        wxArrayString names;
        const char* layers[] = { "F.Cu", "B.Cu", "F.Adhesive", "B.Adhesive", "F.Paste", "B.Paste",
                                 "F.Silkscreen", "B.Silkscreen", "F.Mask", "B.Mask",
                                 "User.Drawings", "User.Comments", "User.Eco1", "User.Eco2",
                                 "Edge.Cuts", "Margin", "F.Courtyard", "B.Courtyard", "F.Fab",
                                 "B.Fab", "User.1", "User.2" };
        for( const char* l : layers )
            names.Add( l );

        wxCheckListBox* clb = new wxCheckListBox( dlg, wxID_ANY, wxDefaultPosition, wxDefaultSize,
                                                  names, 0 );
        clb->SetMinSize( wxSize( 150, -1 ) );
        wxArrayInt order;
        for( size_t i = 0; i < names.size(); ++i )
            order.Add( (int) i );
        wxRearrangeList* rl = new wxRearrangeList( dlg, wxID_ANY, wxDefaultPosition, wxDefaultSize,
                                                   order, names );
        wxBoxSizer* s = new wxBoxSizer( wxHORIZONTAL );
        s->Add( clb, 1, wxALL | wxEXPAND | wxFIXED_MINSIZE, 3 );
        s->Add( rl, 1, wxALL | wxEXPAND, 3 );
        dlg->SetSizer( s );
        dlg->Layout();
        s->Fit( dlg );
        dlg->Show();
        wxYield();

        wxSize cb = clb->GetBestSize(), rb = rl->GetBestSize();
        int ch = clb->GetCharHeight();
        printf( "count %zu charHeight %d\n", names.size(), ch );
        printf( "wxCheckListBox best %d x %d, size %d x %d\n", cb.x, cb.y, clb->GetSize().x,
                clb->GetSize().y );
        printf( "wxRearrangeList best %d x %d, size %d x %d\n", rb.x, rb.y, rl->GetSize().x,
                rl->GetSize().y );
        dlg->Destroy();
        return false;
    }
};

wxIMPLEMENT_APP( App );
