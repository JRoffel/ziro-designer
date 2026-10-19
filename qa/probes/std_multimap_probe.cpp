// std::multimap<unsigned int, unsigned int> - CACHED_CONTAINER's FREE_CHUNK_MAP - driven through
// a seeded random mix of the calls cached_container.cpp makes: insert, lower_bound, erase of a
// held iterator (reallocate holds lower_bound's result across an addFreeChunk), size, clear and
// a begin()-to-end() walk. Every operation and every answer is printed as JSON, so
// qa/unittests/common/libc/multimap.test.ts can replay the same calls on STD_MULTIMAP.
//
//   g++ -O2 -std=c++17 -o /tmp/std_multimap_probe qa/probes/std_multimap_probe.cpp
//   /tmp/std_multimap_probe > qa/data/common/libc/std_multimap_probe.json
#include <cstdio>
#include <map>
#include <random>
#include <vector>

typedef std::multimap<unsigned int, unsigned int> FREE_CHUNK_MAP;

static void walk( const FREE_CHUNK_MAP& aMap )
{
    printf( "[" );
    bool first = true;

    for( const auto& [size, offset] : aMap )
    {
        printf( "%s[%u,%u]", first ? "" : ",", size, offset );
        first = false;
    }

    printf( "]" );
}

int main()
{
    printf( "{\"runs\":[\n" );

    for( int run = 0; run < 6; ++run )
    {
        std::mt19937   rng( 1006 + run );
        FREE_CHUNK_MAP map;
        // Few distinct sizes in the early runs (long equal ranges), many in the later ones.
        unsigned int   maxSize = run < 3 ? 8 : 400;
        unsigned int   nextOffset = 0;

        printf( "%s{\"ops\":[", run ? ",\n" : "" );

        for( int step = 0; step < 600; ++step )
        {
            printf( "%s", step ? ",\n" : "" );
            unsigned int r = rng() % 100;

            if( r < 50 )
            {
                unsigned int size = 1 + rng() % maxSize;
                map.insert( std::make_pair( size, nextOffset ) );
                printf( "[\"insert\",%u,%u]", size, nextOffset );
                nextOffset += size;
            }
            else if( r < 88 )
            {
                // reallocate(): lower_bound, an addFreeChunk while the iterator is held, erase.
                unsigned int size = 1 + rng() % maxSize;
                auto         it = map.lower_bound( size );

                if( it == map.end() )
                {
                    printf( "[\"lower_bound\",%u,null]", size );
                    continue;
                }

                unsigned int freed = 1 + rng() % maxSize;
                printf( "[\"reallocate\",%u,[%u,%u],%u,%u]", size, it->first, it->second, freed,
                        nextOffset );
                map.insert( std::make_pair( freed, nextOffset ) );
                nextOffset += freed;
                map.erase( it );
            }
            else if( r < 98 )
            {
                printf( "[\"size\",%zu]", map.size() );
            }
            else if( r < 99 || rng() % 4 )
            {
                // r is 98 here or 99 on three draws in four: a walk, the full order.
                printf( "[\"walk\",%zu,", map.size() );
                walk( map );
                printf( "]" );
            }
            else
            {
                map.clear();
                printf( "[\"clear\"]" );
            }
        }

        printf( "],\"final\":" );
        walk( map );
        printf( "}" );
    }

    printf( "\n]}\n" );
}
