// KiCad's own MMH3_HASH (libs/kimath/include/mmh3_hash.h) over seeded random inputs: every byte
// length from 0 to 80 (each tail case, one to five blocks), a few large buffers, and int32 word
// streams fed through add( int32_t ) the way SHAPE_POLY_SET::checksum feeds it. The digests are
// what qa/unittests/kimath/mmh3_hash.test.ts compares mmh3HashToString* against.
//
//   g++ -O2 -std=c++17 -I/home/akshay/kicad-reference/libs/kimath/include \
//       -o /tmp/mmh3_probe qa/probes/mmh3_probe.cpp
//   /tmp/mmh3_probe > qa/data/kimath/mmh3_probe.json
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <random>
#include <vector>
#include <mmh3_hash.h>

static void hex( const std::vector<uint8_t>& aData )
{
    printf( "\"" );
    for( uint8_t b : aData )
        printf( "%02x", b );
    printf( "\"" );
}

int main()
{
    std::mt19937 rng( 1006 );
    bool         first = true;
    printf( "{\"bytes\":[\n" );

    std::vector<size_t> lengths;
    for( size_t n = 0; n <= 80; ++n )
        lengths.push_back( n );
    for( size_t n : { 255, 1000, 4096, 4099, 65537 } )
        lengths.push_back( n );

    for( size_t n : lengths )
    {
        std::vector<uint8_t> data( n );
        for( uint8_t& b : data )
            b = rng() & 0xff;

        uint32_t   seed = rng();
        MMH3_HASH  hash( seed );
        hash.addData( data.data(), data.size() );

        printf( "%s{\"seed\":%u,\"data\":", first ? "" : ",\n", seed );
        // Big buffers are regenerated in the test from the same bytes: print them only up to 4 KiB.
        hex( data );
        printf( ",\"digest\":\"%s\"}", hash.digest().ToString().c_str() );
        first = false;
    }

    printf( "\n],\"words\":[\n" );
    first = true;

    for( size_t n : { 1, 2, 3, 4, 5, 7, 8, 9, 63, 64, 65, 1001 } )
    {
        std::vector<int32_t> words( n );
        for( int32_t& w : words )
            w = (int32_t) rng();

        MMH3_HASH hash( 0x68AF835D );
        for( int32_t w : words )
            hash.add( w );

        printf( "%s{\"words\":[", first ? "" : ",\n" );
        for( size_t i = 0; i < n; ++i )
            printf( "%s%d", i ? "," : "", words[i] );
        printf( "],\"digest\":\"%s\"}", hash.digest().ToString().c_str() );
        first = false;
    }

    printf( "\n]}\n" );
}
