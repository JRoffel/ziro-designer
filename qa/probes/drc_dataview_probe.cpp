// DIALOG_DRC's results list (pcbnew/dialogs/dialog_drc_base.cpp:103-110, common/rc_item.cpp:406-413):
// a wxNotebook with SetMinSize( 640, -1 ) holding a wxDataViewCtrl (wxDV_NO_HEADER) whose one text
// column RC_TREE_MODEL makes the client width. Asks wxGTK: does a long violation widen the dialog's
// best size, and how does the text renderer cut what does not fit?
//
//   g++ -Wno-deprecated-declarations -o drc_dataview_probe drc_dataview_probe.cpp \
//       $(wx-config --cxxflags --libs core,base,adv)
#include <wx/wx.h>
#include <wx/dataview.h>
#include <wx/notebook.h>
#include <cstdio>

class App : public wxApp
{
public:
    bool OnInit() override
    {
        wxDialog* dlg = new wxDialog( nullptr, wxID_ANY, "DRC Control", wxDefaultPosition,
                                      wxDefaultSize, wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER );
        wxBoxSizer* main = new wxBoxSizer( wxVERTICAL );
        wxNotebook* nb = new wxNotebook( dlg, wxID_ANY );
        nb->SetMinSize( wxSize( 640, -1 ) );
        wxPanel* page = new wxPanel( nb );
        wxBoxSizer* ps = new wxBoxSizer( wxVERTICAL );
        ps->SetMinSize( wxSize( -1, 320 ) );
        wxDataViewListCtrl* dv = new wxDataViewListCtrl( page, wxID_ANY, wxDefaultPosition,
                                                         wxDefaultSize, wxDV_NO_HEADER );
        ps->Add( dv, 1, wxEXPAND | wxALL, 5 );
        page->SetSizer( ps );
        nb->AddPage( page, "Violations (0)" );
        main->Add( nb, 1, wxEXPAND | wxALL, 5 );
        dlg->SetSizer( main );
        main->Fit( dlg );
        wxSize empty = dlg->GetSize();

        wxDataViewColumn* col = dv->AppendTextColumn( "", wxDATAVIEW_CELL_INERT, 600 );
        wxVector<wxVariant> row;
        row.push_back( wxVariant( wxString( "Error: Board edge clearance violation (board setup "
                                            "constraints edge clearance 0.3720 mm; actual 0.2164 "
                                            "mm) and a great deal more text to be sure it is long" ) ) );
        dv->AppendItem( row );
        dlg->InvalidateBestSize();
        dv->InvalidateBestSize();
        wxSize best = dlg->GetBestSize();
        main->Fit( dlg );
        wxSize refit = dlg->GetSize();

        printf( "dialog fitted empty: %d x %d\n", empty.x, empty.y );
        printf( "dialog best with a long row: %d x %d, refit %d x %d\n", best.x, best.y, refit.x,
                refit.y );
        printf( "dataview best size: %d x %d\n", dv->GetBestSize().x, dv->GetBestSize().y );
        printf( "renderer ellipsize mode: %d (NONE=%d START=%d MIDDLE=%d END=%d)\n",
                (int) col->GetRenderer()->GetEllipsizeMode(), (int) wxELLIPSIZE_NONE,
                (int) wxELLIPSIZE_START, (int) wxELLIPSIZE_MIDDLE, (int) wxELLIPSIZE_END );
        dlg->Destroy();
        return false;
    }
};

wxIMPLEMENT_APP( App );
